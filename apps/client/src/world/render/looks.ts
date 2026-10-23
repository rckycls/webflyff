import type { WornPart } from '@flyffweb/protocol';
import { DEFAULT_MOTION, motionKey, partKey, skeletonKey } from '@flyffweb/scene';
import type { Gender } from '@flyffweb/scene';
import { Mti } from '../sim/constants';
import type { GameData } from '../gameData';
import type { Mover } from '../WorldState';

/**
 * Which converted files make up a mover, as logical keys of the asset index, and how Neuz builds them. A player (and
 * a human NPC) is the skeleton of its sex with the parts `CMover::UpdateParts` loads onto it
 * (`Source/_Common/MoverEquip.cpp:279`); any other mover is the one model of its `propMover.txt` entry.
 */
export interface MoverLook {
  /** Skeleton of the mover; null for a model that is not animated. */
  skeleton: string | null;
  /** The models to draw, in slot order for a player. */
  parts: string[];
  /** The motion file the mover plays for an `MTI_*` motion: its standing motion for one it lacks, null if it has none. */
  motion: (motionId: number) => string | null;
  /** `m_dwHairColor` as ADD_OBJ sends it (0xAARRGGBB), for the scene to tint the hair part with; null if the mover has none. */
  hairColor: number | null;
}

/** `MI_MALE` and `MI_FEMALE` (`Resource/defineObj.h:954-955`): the bodies of players and human NPCs, with no model of their own. */
const MI_MALE = 11;
const MI_FEMALE = 12;
/** `SEX_MALE` (`Resource/define.h:74`). `PARTSMESH_*( nSex )` test `nSex == SEX_MALE` only: any other value is a woman. */
const SEX_MALE = 0;
/** `CItemElem::expired` (`_Common/Item.h:119`), a bit of a worn part's flag: the item shows nothing (`MoverEquip.cpp:322,346`). */
const ITEM_EXPIRED = 0x01;

/** `PARTS_*` (`Resource/defineNeuz.h:24-61`): the slots of a body that the rules below use. */
const Parts = {
  HEAD: 0, HAIR: 1, UPPER_BODY: 2, LOWER_BODY: 3, HAND: 4, FOOT: 5, CAP: 6, CLOAK: 8, HAT: 26, CLOTH: 27, GLOVE: 28,
  BOOTS: 29, CLOAK2: 30,
} as const;

/** What a slot shows with no item: `PARTSMESH_UPPER`, `_LOWER`, `_HAND` and `_FOOT` (`MoverEquip.cpp:75-78`, used at :426-445). */
const BARE_BODY = [
  [Parts.UPPER_BODY, 'upper'], [Parts.LOWER_BODY, 'lower'], [Parts.HAND, 'hand'], [Parts.FOOT, 'foot'],
] as const;

/**
 * The fashion slot that covers an armour slot (`nArryEquip2` over `nArryEquip1`, `CMover::OverCoatItemRenderCheck`,
 * `Mover.cpp:9122-9123`): the covered part is hidden while the covering one is there.
 */
const OVERCOATS = [
  [Parts.CAP, Parts.HAT], [Parts.UPPER_BODY, Parts.CLOTH], [Parts.HAND, Parts.GLOVE], [Parts.FOOT, Parts.BOOTS],
  [Parts.CLOAK, Parts.CLOAK2],
] as const;

type MotionTable = Readonly<Record<string, string | undefined>>;

/** `CModelMng::MakeMotionName` (`ModelMng.cpp:124-133`) plays MTI_STAND for a motion the mover does not list. */
function motionOf(table: MotionTable, stand: string | null): (motionId: number) => string | null {
  return (motionId) => table[motionId] ?? table[Mti.STAND] ?? stand;
}

/** `"%02d"`. */
const twoDigits = (n: number): string => String(n).padStart(2, '0');

interface Dressing {
  gender: Gender;
  hairMesh: number;
  headMesh: number;
  hairColor: number;
  worn: readonly WornPart[];
}

/** NULL_ID, written `=` in `propItem.txt`: no `dwExclusive` (`!= NULL_ID`, `MoverEquip.cpp:328`) or `dwBasePartsIgnore` (`!= -1`). */
const NO_PART = -1;

/** An item worn in a slot, with the columns of its row that `UpdateParts` and `CMover::Render` read. */
interface Equipped {
  /** The part model for the wearer's sex; null if the catalog has none. */
  model: string | null;
  exclusive: number;
  baseIgnore: number;
  expired: boolean;
}

/**
 * What is worn, by slot (`m_aEquipInfo[i]`): the entries of `worn` whose item the catalog knows, but not the head and hair
 * slots (`UpdateParts` skips them, `MoverEquip.cpp:306,338`). An `items.json` written before the converter kept
 * `exclusive` and `baseIgnore` lacks them; that reads as NULL_ID, what a `=` cell in the table means.
 */
function equippedBy(worn: readonly WornPart[], gender: Gender, data: GameData): Map<number, Equipped> {
  const equipped = new Map<number, Equipped>();
  for (const w of worn) {
    const item = data.items.get(w.itemId);
    if (item === undefined || w.part === Parts.HEAD || w.part === Parts.HAIR) continue;
    equipped.set(w.part, {
      model: item[gender],
      exclusive: item.exclusive ?? NO_PART,
      baseIgnore: item.baseIgnore ?? NO_PART,
      expired: (w.flag & ITEM_EXPIRED) !== 0,
    });
  }
  return equipped;
}

/**
 * The slots `CMover::Render` hides for the worn cap and fashion hat (`MoverRender.cpp:394-511`, the same for the own
 * character from the inventory and for others from `m_aEquipInfo`). The cap hides the slot its `dwBasePartsIgnore` names,
 * expired or not (no flag is tested for it, `:403,:462`). A fashion hat that is not expired (`:413,:471`) decides next:
 * with a `dwBasePartsIgnore` of its own it hides that slot as well, and PARTS_HEAD the hair too (`:416-421`); with none,
 * what the cap hid shows again (`:423-427`).
 */
function hiddenSlots(equipped: ReadonlyMap<number, Equipped>): Set<number> {
  const hidden = new Set<number>();
  const cap = equipped.get(Parts.CAP);
  if (cap !== undefined && cap.baseIgnore !== NO_PART) hidden.add(cap.baseIgnore);
  const hat = equipped.get(Parts.HAT);
  if (hat !== undefined && !hat.expired) {
    if (hat.baseIgnore !== NO_PART) {
      if (hat.baseIgnore === Parts.HEAD) hidden.add(Parts.HAIR);
      hidden.add(hat.baseIgnore);
    } else if (cap !== undefined) {
      hidden.delete(cap.baseIgnore);
    }
  }
  return hidden;
}

/**
 * `UpdateParts` with `bIfParts` on (a player's `MoverProp` has it) and `OverCoatItemRenderCheck`, then the parts hidden at
 * render time:
 * - the hair and head meshes, numbered from 1 (`MoverEquip.cpp:293-298`);
 * - the model of each worn item that is not expired, in its slot (`:334-366`);
 * - in an empty upper body, lower body, hand or foot slot the bare body part (`:426-445`), unless a worn item names the
 *   slot in `dwExclusive` (`:300-333`): its bare part is not loaded. An item worn in that slot still shows;
 * - a worn fashion slot (hat, cloth, glove, boots, second cloak) takes the part of the armour slot it covers away
 *   (`Mover.cpp:9122-9150`);
 * - the slots `hiddenSlots` names are dropped.
 * An item the catalog lacks, or has no model for the sex, is as no item: the bare part shows.
 */
function humanLook({ gender, hairMesh, headMesh, hairColor, worn }: Dressing, data: GameData): MoverLook {
  const equipped = equippedBy(worn, gender, data);
  const taken = new Set<number>(); // abExclusiveParts
  const slots = new Map<number, string>();
  slots.set(Parts.HEAD, partKey(`part_${gender}head${twoDigits(headMesh + 1)}`));
  slots.set(Parts.HAIR, partKey(`part_${gender}hair${twoDigits(hairMesh + 1)}`));
  for (const [slot, item] of equipped) {
    if (item.expired) continue; // :322,:346: an expired item is none
    if (item.exclusive !== NO_PART) taken.add(item.exclusive);
    if (item.model) slots.set(slot, item.model);
  }
  for (const [slot, name] of BARE_BODY) {
    if (!taken.has(slot) && !slots.has(slot)) slots.set(slot, partKey(`part_${gender}${name}`));
  }
  for (const [armour, overcoat] of OVERCOATS) if (slots.has(overcoat)) slots.delete(armour);
  for (const slot of hiddenSlots(equipped)) slots.delete(slot);

  const parts = [...slots].sort(([a], [b]) => a - b).map(([, key]) => key);
  // the body mover's motions are the gender's; the viewer's standing motion stands in where the game data lacks them
  const body = data.movers.get(gender === 'male' ? MI_MALE : MI_FEMALE);
  return {
    skeleton: skeletonKey(gender),
    parts,
    motion: motionOf(body?.motions ?? {}, motionKey(gender, DEFAULT_MOTION[gender])),
    hairColor,
  };
}

/** The own character's item ids as `m_aEquipInfo`: each in the slot its item takes (`dwParts`); ids the catalog lacks are skipped. */
function ownWorn(itemIds: readonly number[], data: GameData): WornPart[] {
  return itemIds.flatMap((itemId) => {
    const item = data.items.get(itemId);
    return item === undefined ? [] : [{ part: item.part, itemId, flag: 0 }];
  });
}

/**
 * The look of a mover, or null when nothing it needs was converted (the scene shows a placeholder):
 * - A player is dressed from its ADD_OBJ: sex, head and hair meshes, hair colour and the worn parts. The own character's
 *   ADD_OBJ lists no item ids (`AddedPlayer.equipmentObjectIds` are inventory object ids), so it is dressed from
 *   `ownEquipment`, the item ids of the character list, as Neuz's character select dresses it.
 * - An NPC whose body is `MI_MALE` or `MI_FEMALE` is dressed the same way from the NPC part of its ADD_OBJ, its sex
 *   from the body.
 * - Any other NPC and a monster are the model and skeleton of their `propMover.txt` entry.
 * The skin set picks a texture of the bare body parts (`PARTSTEX_UPPER`, `MoverEquip.cpp:81`), which the converted
 * models do not offer, so it is not part of the look.
 */
export function lookOf(mover: Mover, data: GameData, ownEquipment: readonly number[] = []): MoverLook | null {
  const { added } = mover;
  if (mover.kind === 'player') {
    const player = added.player;
    if (player === undefined) return null;
    return humanLook({
      gender: player.sex === SEX_MALE ? 'male' : 'female',
      hairMesh: player.hairMesh,
      headMesh: player.headMesh,
      hairColor: player.hairColor,
      worn: mover.isSelf ? ownWorn(ownEquipment, data) : player.worn,
    }, data);
  }
  if (added.index === MI_MALE || added.index === MI_FEMALE) {
    const npc = added.npc;
    return humanLook({
      gender: added.index === MI_MALE ? 'male' : 'female',
      hairMesh: npc?.hairMesh ?? 0,
      headMesh: npc?.headMesh ?? 0,
      hairColor: npc?.hairColor ?? 0,
      worn: npc?.worn ?? [],
    }, data);
  }
  const prop = data.movers.get(added.index);
  if (prop === undefined || prop.model === null) return null;
  return { skeleton: prop.skeleton, parts: [prop.model], motion: motionOf(prop.motions, null), hairColor: null };
}
