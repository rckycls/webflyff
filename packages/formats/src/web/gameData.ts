// The JSON catalogs the converter's game-data stage writes and the browser client reads, to dress and name what the
// world draws. Types only, besides the logical keys: the shapes are the contract, and the stage's files are
// content-hashed like every other output (`data/movers.json` becomes `data/movers.<10 hex>.json` in the asset index).

import type { PkColors } from '../inc/pkSetting';
import type { JobProp } from '../inc/propJob';

/** One mover of `propMover.txt`, with the converted files its model, skeleton and motions are in. */
export interface WebMover {
  /** The mover's id: the `MI_*` value of propMover.txt, which ADD_OBJ sends and mdlDyna.inc's mover entries use. */
  index: number;
  /** `MoverProp::szName`: the English name. */
  name: string;
  /** `MoverProp::fSpeed`, as the table gives it (CMover::GetSpeed starts from it). */
  speed: number;
  /**
   * `MoverProp::dwAI`, an `AII_*` value (`defineNeuz.h`: AII_MOVER 1, AII_MONSTER 2 ...). CreateObj halves the speed of
   * an AII_MONSTER (CreateObj.cpp:644-649), so the client needs it to move a monster as Neuz does.
   */
  ai: number;
  /**
   * `MoverProp::dwFlying == 1`: a flying monster, which Neuz moves with the flying rules (ActionMover.cpp:183), not the
   * ground's. A movers.json written before the converter kept it has none: the client reads that as false.
   */
  flying: boolean;
  /** `MoverProp::dwLevel`: the mover's level (-1, written `=`, for one that has none). */
  level: number;
  /** `MoverProp::dwAddHp`: the base of a monster's maximum HP (CMover::GetMaxOriginHitPoint, MoverParam.cpp:2880). */
  addHp: number;
  /** `MoverProp::nExpValue`: the EXP a kill gives (64 bits in the C++; every shipped value is a safe integer). */
  expValue: number;
  /** `MoverProp::dwClass`: the rank, a `RANK_*` value (RANK_LOW, RANK_BOSS, RANK_GUARD ...). */
  rank: number;
  /** `MoverProp::dwBelligerence`: how it treats a player, a `BELLI_*` value. */
  belligerence: number;
  /** `MoverProp::bKillable`, as the table gives it: the C++ tests it against both 0 and 1. */
  killable: number;
  /** `MoverProp::dwHideLevel`: 1 for a mover whose level the target bar does not show. */
  hideLevel: number;
  /** `MoverProp::eElementType`: the mover's element, an `SAI79::ePropType` value (0 for none). */
  element: number;
  /**
   * `MoverProp::dwAtk1`: the item (`II_*`) a monster attacks with, its `m_dwVirtItem` (`CMover::InitProp`,
   * Mover.cpp:1536), whose hit effect a blow plays (`GetActiveHandItemProp`, :2960-2966); -1 (`=`) for none. A
   * movers.json written before the converter kept it has none: the client reads that as -1.
   */
  atk1: number;
  /**
   * Logical key of the body model (`models/mvr_<name>.glb`, CModelMng::MakeModelName). Null for the player bodies
   * MI_MALE and MI_FEMALE, which Neuz assembles from parts (CMover::LoadModel, Mover.cpp:1427), and for a mover whose
   * model was not converted.
   */
  model: string | null;
  /**
   * Logical key of the skeleton (`skeletons/mvr_<name>.glb`, the `.chr` CModelMng::LoadModel loads for an animated
   * mesh); null for a mover that is not animated or whose skeleton was not converted.
   */
  skeleton: string | null;
  /**
   * Motion id (`MTI_*`, as a decimal string) to the logical key of the motion
   * (`motions/<skeleton>/<motion file>.glb`, the file name CModelMng::MakeMotionName builds). Only motions
   * mdlDyna.inc lists for the mover and that were converted. CModelMng::MakeMotionName plays MTI_STAND (0) in place
   * of an id the mover does not list, so a lookup that misses falls back to "0".
   */
  motions: Record<string, string>;
}

/** An item that shows a model on the body when worn (`mdlDyna.inc` OT_ITEM entries that have a part). */
export interface WebItemModel {
  /** The item's id (`II_*`). */
  id: number;
  /** `ItemProp::dwParts`: the body slot the item takes, a `PARTS_*` number (-1 for an item that is worn nowhere). */
  part: number;
  /**
   * `ItemProp::dwExclusive`: the slot (`PARTS_*`) whose bare default model this item takes off (CMover::UpdateParts,
   * MoverEquip.cpp:300-333), -1 for none. PARTS_LOWER_BODY for every suit and fashion body, so no bare legs show under it.
   */
  exclusive: number;
  /**
   * `ItemProp::dwBasePartsIgnore`: the base slot this item hides while worn (CMover::Render, MoverRender.cpp:400-505),
   * -1 for none. PARTS_HAIR for a helmet or hat that covers the hair; PARTS_HEAD (which also hides the hair) for a hat
   * that covers the head.
   */
  baseIgnore: number;
  /** Logical key of the part model a man wears (`models/part_<...>.glb`, CModelMng::MakePartsName); null if none. */
  male: string | null;
  /** Logical key of the part model a woman wears; the same as `male` when the entry has one name for both. */
  female: string | null;
}

/**
 * One item of `propItem.txt`, with the columns the fight reads (data/itemProps.json, by item id; a repeated id keeps
 * the last row, as CFixedArray::SetAtGrow does). A -1 is a `=` cell, NULL_ID.
 */
export interface WebItemProp {
  /** The item's id (`II_*`). */
  id: number;
  /** `ItemProp::szName`: the English name. */
  name: string;
  /**
   * `dwPackMax`: how many of the item one inventory slot holds. Above 1 the item stacks: the task bar prints its count
   * and keeps its item id for another stack (`CWndTaskBar::OnDraw`, WndTaskBar.cpp:836-847; `Serialize`, :345-380).
   */
  packMax: number;
  /** `dwItemKind1`, `dwItemKind2`, `dwItemKind3`: the kinds (`IK1_*`, `IK2_*`, `IK3_*`). */
  kind1: number;
  kind2: number;
  kind3: number;
  /** `dwHanded`: how the item is held, an `HD_*` value. */
  handed: number;
  /** `dwParts`: the body slot the item takes when worn, a `PARTS_*` value (PARTS_RWEAPON 10 for a one-handed weapon). */
  part: number;
  /** `dwAbilityMin`, `dwAbilityMax`: a weapon's attack range, an armour's defence range. */
  abilityMin: number;
  abilityMax: number;
  /** `dwWeaponType`: a `WT_*` value. */
  weaponType: number;
  /** `fAttackSpeed`, as the C `float` of the table's token (`Math.fround(0.085)`); -1 for `=`. */
  attackSpeed: number;
  /** `dwAttackRange`: the reach, an `AR_*` value. */
  attackRange: number;
  /** `dwDestParam[0..2]` (`DST_*`) and `nAdjParamVal[0..2]`: what the item changes and by how much. */
  destParams: number[];
  adjParams: number[];
  /** `dwSfxObj3`: the effect shown at the target when the item hits, an `XI_*` id (see WebEffectsIndex), -1 for none. */
  sfxHit: number;
  /**
   * Logical key of the model a held item shows (`models/item_<name>.glb`, CModelMng::MakeModelName of its OT_ITEM entry
   * in mdlDyna.inc). Null for an item whose entry has a part (it is worn: see WebItemModel), one with no entry, and one
   * whose model was not converted.
   */
  model: string | null;
  /**
   * Logical key of the icon (`ui/item/<web name of szIcon>.png`, which the UI stage writes from Client/Item, where
   * CItemBase::SetTexture loads it, Item.cpp:114); null for an item with none. A pet egg's picture is another file of the
   * folder, `szIcon` with `_00.`, `_01.` or `_02.` in place of its dot by the pet's level (Item.cpp:92-111), so its key has
   * no file.
   */
  icon: string | null;
}

/** A non-player character of `character.inc` and its two sister files. */
export interface WebNpc {
  /**
   * The key as the file writes it (`CHARACTER::m_szKey`). Neuz looks characters up by the lower-cased key
   * (CProject::GetCharacter, Project.h:1376), so look it up with `key.toLowerCase()`.
   */
  key: string;
  /** `CHARACTER::m_strName`: the English name. */
  name: string;
}

/** The three player name colours of `PKSetting.inc`: ARGB, unsigned. */
export type WebNameColors = PkColors;

/** Honour id (a decimal string) to the title text (`honorList.txt`), what CTitleManager::GetTitle returns. */
export type WebHonorTitles = Record<string, string>;

/**
 * World id (a decimal string, the `WI_*` value the world server names a character's world by) to the web folder name of
 * that world: `webName` of the `m_szFileName` World.inc gives it (`CWorldMng::Open`, worldmng.cpp:206, opens the folder of
 * that name under `World/`), which is the folder the worlds stage writes `worlds/<name>/manifest.json` in. It lists every
 * world of World.inc, converted or not; a world was converted if its manifest is in the asset index.
 */
export type WebWorlds = Record<string, string>;

/**
 * A job of `propJob.inc` (data/jobs.json, job `JOB_*` at index `JOB_*`): its row (`m_aPropJob`) and `title`, the job's
 * name of etc.inc's `job` block (`m_aJob[ id ].szName`, CProject::LoadEtc, Project.cpp:903-920), which
 * `CMover::GetJobString` gives the windows (MoverParam.cpp:354-359): "Vagrant". A job etc.inc names nothing for has ''.
 */
export interface WebJob extends JobProp {
  title: string;
}

/**
 * A row of the EXP table (`ExpTable.inc`, the `expCharacter` block; data/exp.json, row `level` at index `level`). The
 * EXPINTEGER columns pass 32 bits (and one reaches past 2^53), so JSON carries them as decimal text: the client parses
 * them back to `ExpRow` with bigint.
 */
export interface WebExpRow {
  exp1: string;
  exp2: string;
  lpPoint: number;
  limitExp: string;
}

/**
 * `TID_*` name to the client text (`textClient.inc`): the text, its colour as unsigned ARGB, and `textId`, the number
 * `defineText.h` gives the name (data/texts.json). The server names a text by that number (DEFINEDTEXT,
 * `CDPClient::OnDefinedText`, `Neuz/DPClient.cpp:4117`), which Neuz looks up with `prj.GetText( dwText )`. A name that no
 * header numbers, and every text of a texts.json written before the converter kept the numbers, has no `textId`.
 */
export type WebTexts = Record<string, { text: string; color: number; textId?: number }>;

/** What the effects index says of one effect: its converted file and the `fScale` of its mdlDyna.inc entry. */
export interface WebEffectRef {
  /** Logical key of the effect (`effects/<web name of the .sfx file's stem>.json`, which the effects stage writes). */
  effect: string;
  /** The entry's `fScale`, a C float: CSfx::SetSfx (SfxObj.cpp:77) loads the effect with CObj::ResetScale (Obj.cpp:390). */
  scale: number;
}

/** `XI_*` id (a decimal string) to its effect: the OT_SFX entries of mdlDyna.inc that name a `.sfx` (data/effectsIndex.json). */
export type WebEffectsIndex = Record<string, WebEffectRef>;

/**
 * A job skill (data/skills.json, in id order): its row of `propSkill.txt` and its levels of `propSkillAdd.csv`, as
 * CProject::LoadSkill (Project.cpp:375-400) and LoadPropAddSkill (:2522-2611) keep them. The skills of `JTYPE_COMMON`
 * (the effects of items, monsters and buffs: `SI_GEN_FLASH`, `SI_GEN_BLEEDING` ...) are not in the catalog: they are on
 * no job's list. (The type decides, not the name: the Vagrant's four `SI_GEN_EVE_*` event buffs are `JTYPE_BASE`, so they
 * are in.) A -1 is a `=` cell, NULL_ID.
 */
export interface WebSkill {
  /** The skill's id (`SI_*`): what a player's skill slot calls `dwSkill`. */
  id: number;
  /** `szName`: the English name. */
  name: string;
  /** `szCommand`: the description (the file calls the column szComment). */
  description: string;
  /** `dwItemKind1`: the job type, a `JTYPE_*` value (JTYPE_BASE 0 for a Vagrant's skill). */
  jobType: number;
  /** `dwItemKind2`: the job whose list the skill is on, a `JOB_*` value (JOB_VAGRANT 0). */
  job: number;
  /** `dwHanded`: the hands the weapon in use has to have, an `HD_*` value (the server checks it; HD_ONE 1). */
  handed: number;
  /** `dwAttackRange`: how near the caster walks to its target, an `AR_*` value (AR_SHORT 1). */
  attackRange: number;
  /**
   * `dwReqDisLV`: the character level that unlocks the skill. `CMover::CheckSkill` (MoverParam.cpp:117-156) refuses a skill
   * when `!IsMaster() && !IsHero() && GetLevel() < (int)dwReqDisLV` (:124): a Master or Hero skips the level test. -1 for
   * `=` (the four event buffs of the Vagrant): no level is below it, so such a skill is open at every level.
   */
  reqLevel: number;
  /** The skills that have to be raised first: `dwReSkill1/Level1` and `dwReSkill2/Level2`, the ones that are not `=`. */
  reqSkills: Array<{ skill: number; level: number }>;
  /** `dwUseMotion`: the motion the caster plays, an `MTI_*` id (`MTI_VAG_ONE_CLEANHIT` 1000). */
  useMotion: number;
  /** `dwSfxObj3`: the effect shown at the target when the skill hits, an `XI_*` id (see WebEffectsIndex), -1 for none. */
  sfxHit: number;
  /** `dwExeTarget`: how the target is found, an `EXT_*` value (EXT_MELEEATK 17). */
  exeTarget: number;
  /** `dwUseChance`: what the skill needs to be used, a `WUI_*` value (WUI_TARGETINGOBJ 4: a selected target). */
  useChance: number;
  /** `dwSkillType`: `KT_SKILL` 2 (a melee skill, which costs FP) or `KT_MAGIC` 1. */
  skillType: number;
  /** `nEvildoing`: negative for a harmful skill, which needs a target that can be attacked. */
  evildoing: number;
  /** `dwExpertMax`: the highest level the skill can be raised to. */
  maxLevel: number;
  /** `dwComboStyle`: where the skill can be put on the task bar and in the action slot, a `CT_*` value. */
  comboStyle: number;
  /**
   * Logical key of the icon (`ui/<web name of szIcon>.png`, which the UI stage writes from Client/Icon, where the task
   * bar loads a skill's picture from, WndTaskBar.cpp:396); null when the table names none or Client/Icon lacks the file.
   */
  icon: string | null;
  /**
   * The skill's levels, `levels[level - 1]` for level 1 to `maxLevel`: the rows `dwSubDefine + level - 1` of
   * propSkillAdd.csv (CProject::GetAddSkillProp, Project.cpp:879-896; the C++ reads level 0 as level 1).
   * `reqMp`, `reqFp` and `skillCount` are `nReqMp`, `nReqFp` and `nSkillCount` of the row; `cooldown` is `dwCooldown`,
   * or the skill's `dwSkillReady` when the row gives none (:2587-2596).
   */
  levels: Array<{ reqMp: number; reqFp: number; cooldown: number; skillCount: number }>;
}

/** The logical keys of the catalogs in the asset index. */
export const GAME_DATA_KEYS = {
  movers: 'data/movers.json',
  items: 'data/items.json',
  npcs: 'data/npcs.json',
  nameColors: 'data/nameColors.json',
  honorTitles: 'data/honorTitles.json',
  worlds: 'data/worlds.json',
  itemProps: 'data/itemProps.json',
  jobs: 'data/jobs.json',
  exp: 'data/exp.json',
  texts: 'data/texts.json',
  effectsIndex: 'data/effectsIndex.json',
  skills: 'data/skills.json',
} as const;
