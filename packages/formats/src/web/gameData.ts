// The JSON catalogs the converter's game-data stage writes and the browser client reads, to dress and name what the
// world draws. Types only, besides the logical keys: the shapes are the contract, and the stage's files are
// content-hashed like every other output (`data/movers.json` becomes `data/movers.<10 hex>.json` in the asset index).

import type { PkColors } from '../inc/pkSetting';

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

/** The logical keys of the catalogs in the asset index. */
export const GAME_DATA_KEYS = {
  movers: 'data/movers.json',
  items: 'data/items.json',
  npcs: 'data/npcs.json',
  nameColors: 'data/nameColors.json',
  honorTitles: 'data/honorTitles.json',
  worlds: 'data/worlds.json',
} as const;
