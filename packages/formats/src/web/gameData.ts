// The JSON catalogs the converter's game-data stage writes and the browser client reads, to dress and name what the
// world draws. Types only, besides the logical keys: the shapes are the contract, and the stage's files are
// content-hashed like every other output (`data/movers.json` becomes `data/movers.<10 hex>.json` in the asset index).

import type { PkColors } from '../inc/pkSetting';
import type { JobProp } from '../inc/propJob';
import type { RideFlight } from '../inc/propItem';

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
  /**
   * 2026-11-09: `ModelElem::m_nTextureEx` of the mover's mdlDyna.inc entry (`ATEX_01` ...), 1 to 7: the model draws with
   * its extra texture set (`MoverRender.cpp:388-391`, `CObject3D::SetTextureEx`, Object3D.cpp:2511-2549), each material's
   * texture with `-et0N` after its title (`LoadTextureEx`, :2477-2508; `textureExKey`). The three stages of a raised pet
   * are one mesh and differ only by this. Absent for 0 (ATEX_NONE), and in movers.json written before.
   */
  textureEx?: number;
  /**
   * 2026-11-09 (pets R2): `ModelElem::m_fScale` of the mover's mdlDyna.inc entry, a C float: the scale a mover the client
   * makes itself takes (`CMover::SetIndex`'s `ResetScale`, `Mover.cpp:8931`; `CObj::ResetScale`, `Obj.cpp:390-395`), as a
   * raised pet is (1.1 for the white tiger, `mdlDyna.inc:19384`). A server mover's ADD_OBJ scale already holds it (the
   * server's `SetIndex` set it before `m_vScale` was written). Absent for 1, and in movers.json written before.
   */
  modelScale?: number;
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
  /** Native base penya price; server event factors/taxes and upgraded-item prices can differ. */
  cost?: number;
  /** Native szComment/command text, optional in catalogs converted before item tooltips. */
  description?: string;
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
   * `dwSfxObj2`: the missile the item makes, an `XI_*` id: a wand's (`XI_FIR_WAND01`, `OnAttackMagic`,
   * MoverActEvent.cpp:836-840), an arrow's (`XI_ITEM_RANGE_ATK1`, `OnAttackRange`, :717), a monster's attack item's, a
   * yoyo's thrown yoyo. -1 for none. Optional in catalogs converted before Piece 7 M2.
   */
  sfxMissile?: number;
  /** `dwLinkKindBullet`: the `IK2_*` its bullets must be (`IK2_BULLET` 25 for a bow, `CMover::IsBullet`); -1 for none. */
  linkKindBullet?: number;
  /**
   * Piece 7 M3: `dwSkillReadyType`, the item's cast in ms before the server uses it (a Blinkwing's 10000, the Scroll of
   * Return's 4000; `IsItemRedyTime`). Absent for an item with none, and in catalogs converted before M3.
   */
  castMs?: number;
  /** Piece 7 M3: `dwSfxObj` of an item with a cast, its ready effect (`XI_BLINKWING_READY` 118, `CreateItemReadySfx`). */
  sfxReady?: number;
  /** Piece 7 M5: a ride's flight columns (`IK1_RIDE` only); absent on other items and in catalogs converted before M5. */
  flight?: RideFlight;
  /** OT_ITEM ground model, including the box used for worn parts; absent in older catalogs. */
  dropModel?: string | null;
  /** Positive nReflect requests the drop's camera-normal reflection map. */
  reflect?: number;
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
  // 2026-11-05, the item tooltip (`CWndMgr::MakeToolTipText`); each absent where the row says `=` (or 0 for `flag`), and
  // in catalogs converted before
  /** `dwItemJob`: the job the item needs (`PutJob`). */
  job?: number;
  /** `dwItemSex`: the sex the item needs, 0 male, 1 female (`PutSex`). */
  sex?: number;
  /** `dwEndurance`: present (any value) unless the row says `=`, which hides the min`max line (`PutItemMinMax`). */
  endurance?: number;
  /** `dwFlag`: `IP_FLAG_*` bits; 0x04 `IP_FLAG_EQUIP_BIND` soul-links the item once worn. */
  flag?: number;
  /** `dwItemLV`: an element card's level (`PutItemResist`). */
  itemLevel?: number;
  /** `dwLimitLevel1`: the level the item needs (`PutLevel`). */
  limitLevel?: number;
  /** `dwCircleTime`: how long the item lasts in seconds, 1 for "when the player dies" (`PutKeepTime`). */
  circleTime?: number;
  /** `dwReferStat1`: 0 general, 1 unique, 2 ultimate weapon, 3 set armour (the name's colour, `PutItemName`). */
  referStat1?: number;
  /**
   * The base resistances (`nItemResist*`, `(int)( f * 100.0f )`), absent when all are 0: electricity, fire, water, wind,
   * earth, the order `PutBaseResist` prints them in (not the file's).
   */
  resists?: number[];
  // 2026-11-05, the premium items; each absent where the row says `=` (or 0 for the cool-down), and in catalogs converted
  // before
  /** `dwSkillReady` > 0: the cool-down of the item's group, in ms (`CCooltimeMgr::GetGroup`, `GetCoolTime`). */
  cooldownMs?: number;
  /** `dwSkillTime`: the length of the buff the item gives, in ms (999999999 for one with no end). */
  skillTime?: number;
  /** `dwExeTarget`: how the item finds its target, an `EXT_*` value (EXT_ITEM 21: another item, `IsNeedTarget`). */
  exeTarget?: number;
  // 2026-11-09, the pets; each absent where the row says `=`, and in catalogs converted before
  /**
   * `dwReferTarget1`, `dwReferTarget2`: of a vis (`IK3_VIS`), the vis items a buff pet must hold for this one to work
   * (`CMover::SetValidNeedVis`, `IsSatisfyNeedVis`, MoverSkill.cpp:4204-4275; the tooltip's `PutNeededVis`). A vis's
   * minutes and grade are `abilityMin` and `abilityMax`.
   */
  referTarget1?: number;
  referTarget2?: number;
  /** `bPermanence`: TRUE (1) is an item that is not used up (`CItemElem::UseItem`, Item.cpp:272-276). */
  permanence?: number;
}

/** A set of `propItemEtc.inc` (`CSetItem`, Project.cpp:4162-4206): its pieces, and what wearing some of them gives. */
export interface WebSetItem {
  id: number;
  /** The set's name, through the string table. */
  name: string;
  /** The pieces in file order: each item and the part it is worn on. */
  elems: Array<{ itemId: number; part: number }>;
  /** What `count` pieces worn give, sorted by `count` as `CSetItem::SortItemAvail` leaves them. */
  avail: Array<{ dst: number; adj: number; count: number }>;
}

/** A socket card of `propItemEtc.inc` (`PIERCINGAVAIL`): what it gives an item it is socketed in. */
export interface WebPiercingAvail {
  itemId: number;
  params: Array<{ dst: number; adj: number }>;
}

/** An accessory of `accessory.inc` (`CAccessoryProperty`): what it gives at each refine level, 0 to 20. */
export interface WebAccessory {
  itemId: number;
  levels: Array<Array<{ dst: number; adj: number }>>;
}

/** `data/itemEtc.json`: the sets and the socket cards, and the accessories' refine stats (2026-11-05). */
export interface WebItemEtc {
  sets: WebSetItem[];
  piercing: WebPiercingAvail[];
  /** Absent when the client has no accessory.inc. */
  accessories?: WebAccessory[];
}

/** A non-player character of `character.inc` and its two sister files. */
export interface WebNpc {
  teleports?: Array<{ x: number; z: number }>;
  menus?: number[];
  dialogFile?: string;
  vendorTabs?: Record<number, string>;
  vendorType?: number;
  /** The dialogue's picture (`m_szChar`, WndDialog.cpp:294): its asset key, `ui/char/<web name>.png`. */
  image?: string;
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
   * or the skill's `dwSkillReady` when the row gives none (:2587-2596). The rest are Piece 7 M2's (see `WebSkillLevelTimes`).
   */
  levels: Array<{ reqMp: number; reqFp: number; cooldown: number; skillCount: number } & Partial<WebSkillLevelTimes>>;
  /**
   * Piece 7 M2: the effects (`XI_*`, -1 for none): `dwSfxObj` at the caster as the skill begins (`CMover::DoUseSkill`,
   * MoverSkill.cpp:993-996); `dwSfxObj2` the missile (`CCtrl::ShootSkill`, Ctrl.cpp:1367); `dwSfxObj4` the lasting one
   * (`CCtrl::CreateSkillSfx`, Ctrl.cpp:923-939); `dwSfxObj5` at the caster on the hit (:907-913). Optional in catalogs
   * converted before Piece 7 M2, as the rest below.
   */
  sfxCast?: number;
  sfxMissile?: number;
  sfxLasting?: number;
  sfxCaster?: number;
  /** `dwLinkKind`: the weapon the skill needs, an `IK3_*` (or `IK3_MAGICBOTH`, `IK3_YOBO`); -1 for any. */
  linkKind?: number;
  /** `dwLinkKindBullet`: the bullets a bow skill needs (`IK2_BULLET` 25, `CMover::IsBullet`); -1 for none. */
  linkKindBullet?: number;
  /** `dwAtkStyle`: an `AS_*`; `AS_BACK` 8 must be used from behind (`ProcessMoveArrival`, MoverMove.cpp:130-153). */
  atkStyle?: number;
  /** `dwDmgShift`: Strong Wind's push, `dwDmgShift * 0.2` (Sfx.cpp:2494-2510); -1 for none. */
  dmgShift?: number;
  /** `tmContinuousPain` is set: a missile that hits more than once (`ShootSkill`'s `nMaxDmgCnt`, Ctrl.cpp:1396-1405). */
  continuousPain?: boolean;
  /** The row's own `dwDestParam1/2` and `nAdjParamVal1/2` (the tooltip's first lines); -1 for none. */
  destParams?: number[];
  adjParams?: number[];
}

/**
 * Piece 7 M2's numbers of a skill level (`AddSkillProp`, propSkillAdd.csv, Project.cpp:2533-2579), -1 for `=`:
 * `dwCastingTime`, `dwSkillTime` and `dwPainTime` in ms; `dwDestParam1/2`, `nAdjParamVal1/2` and `dwChgParamVal1/2`, which
 * a buff applies (`ApplyParam`, MoverActEvent.cpp:205-433).
 */
export interface WebSkillLevelTimes {
  castingTime: number;
  skillTime: number;
  painTime: number;
  destParams: number[];
  adjParams: number[];
  chgParams: number[];
}

/**
 * Piece 7 M5: the ids of the worlds whose `.wld` says `fly 0` (`CWorld::m_bFly`, `WorldFile.cpp:88-92`), a `number[]`.
 * Optional, so not one of GAME_DATA_KEYS: without it every world allows flight, as the `.wld`'s default does.
 */
export const WORLD_NO_FLY_KEY = 'data/worldNoFly.json';

/**
 * 2026-11-05: the set items and the socket cards of `propItemEtc.inc`, a `WebItemEtc`. Optional, so not one of
 * GAME_DATA_KEYS: without it the item tooltip has no set and socket lines.
 */
export const ITEM_ETC_KEY = 'data/itemEtc.json';

/**
 * 2026-11-09: the chat's catalog (the converter's `chat` stage), a `WebChat`. Optional, so not one of GAME_DATA_KEYS:
 * without it the chat filters no word and its Help window is empty.
 */
export const CHAT_KEY = 'data/chat.json';

/** Filter_ENG.inc (__FILTER_0705): the words of letters, in lower case, and the other entries, each with its replacement. */
export interface WebChatFilter {
  alpha: Record<string, string>;
  nonAlpha: Record<string, string>;
}

/** data/chat.json: the word filter, and help.inc's texts by keyword. */
export interface WebChat {
  filter: WebChatFilter;
  help: Record<string, string>;
}
/** One kind of raised pet: a row of `pet.inc`'s `AvailDestParam` block (`PETAVAILPARAM`, `_Common/pet.h:41-49`). */
export interface WebPetKind {
  /** The kind, a `PK_*` value (`Resource/define.h:250-258`): the row's place in the block. */
  kind: number;
  /** `dwDstParam`: the stat the pet gives, a `DST_*` value. */
  dst: number;
  /**
   * `m_anParam[0..8]`: the 9 step values. Each level reached rolls one step (`m_anAvailLevel`), and the pet gives the sum
   * of the steps' values (`CPet::GetAvailDestParam`, `pet.cpp:378-388`).
   */
  steps: number[];
  /** `m_dwItemId`: the item the pet is once hatched (`CPet::GetItemId`, `pet.h:147-152`; the egg is `II_PET_EGG`). */
  itemId: number;
  /** `m_adwIndex[0..2]`: the mover (`MI_*`) at D and C, at B and A, at S (`CPet::GetIndex`, `pet.cpp:390-401`). */
  models: [number, number, number];
  /** `m_dwProbability`: the chance out of 10,000 that an egg hatches into this kind (`CPetProperty::Hatch`, `pet.cpp:78-89`). */
  hatchWeight: number;
}

/** A row of a `FeedEnergy` block (`FEEDENERGY`): an item whose `dwCost` is in the range makes this much food. */
export interface WebPetFeedEnergy {
  costMin: number;
  costMax: number;
  energyMin: number;
  energyMax: number;
}

/**
 * 2026-11-09: `data/pets.json`, the raised pets' table of `pet.inc` (`CPetProperty::LoadScript`, `_Common/pet.cpp:124-240`).
 * Optional: absent without the file (`PETS_KEY` is not one of GAME_DATA_KEYS).
 */
export interface WebPets {
  /** The kinds, `kinds[PK_*]`. */
  kinds: WebPetKind[];
  /**
   * `m_aFeedEnergy[0]` and `[1]`: the food an item gives by its cost (`GetFeedEnergy`, `pet.cpp:64-76`), `[0]` at the Pet
   * Tamer's mill and `[1]` with the feed maker (`pet.inc`'s comments).
   */
  feedEnergy: [WebPetFeedEnergy[], WebPetFeedEnergy[]];
  /** `m_adwIncrementExp`: the EXP a minute (of 100,000) at D, C, B, A (`GetIncrementExp`, `pet.cpp:91-96`). */
  incrementExp: number[];
  /** `m_awMaxEnergy`: the most energy at D, C, B, A, S (`GetMaxEnergy`, `pet.cpp:98-103`; an egg's is 1). */
  maxEnergy: number[];
  /**
   * `m_aPenalty[PL_D..PL_S]`: what a release costs at D to S (`GetPenalty`, `pet.cpp:37-42`): `exp`, the EXP percent lost
   * (`fExp`, a C float), and `energy` (`wEnergy`).
   */
  penalty: Array<{ exp: number; energy: number }>;
}

/** 2026-11-09: the raised pets' table, a `WebPets`. Optional: not one of GAME_DATA_KEYS. */
export const PETS_KEY = 'data/pets.json';

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
