// Which converted models make up a player character, and what `#/character?...` asks for.
//
// A player is the skeleton mvr_male or mvr_female, a set of body parts skinned to it (the converter's `part_*`
// models, `models/part_<name>.glb`) and one motion of that skeleton (`motions/mvr_<gender>/<motion>.glb`). Parts are
// told apart by their names only: the gender by how the name starts (the rule the converter uses to pick a part's
// skeleton, skeletonFor.ts) and the slot by how it ends.

export type Gender = 'male' | 'female';
export type PartSlot = 'head' | 'hair' | 'cap' | 'upper' | 'hand' | 'foot' | 'other';

export const GENDERS: readonly Gender[] = ['male', 'female'];
export const PART_SLOTS: readonly PartSlot[] = ['head', 'hair', 'cap', 'upper', 'hand', 'foot', 'other'];

/** One part per slot; a slot without one is left out. Parts are named by stem (`part_malehead01`). */
export type Outfit = Partial<Record<PartSlot, string>>;

export const DEFAULT_MALE: Readonly<Outfit> = {
  head: 'part_malehead01',
  hair: 'part_malehair01',
  upper: 'part_mvag01upper',
  hand: 'part_mvag01hand',
  foot: 'part_mvag01foot',
};

export const DEFAULT_MOTION: Readonly<Record<Gender, string>> = {
  male: 'mvr_male_genstand',
  female: 'mvr_female_genstand',
};

const PART_KEY = /^models\/(part_.*)\.glb$/;

/** `models/part_x.glb` gives `part_x`; anything else is taken to be a stem already. */
function stemOf(key: string): string {
  return PART_KEY.exec(key)?.[1] ?? key;
}

/** The gender a part is made for, from its stem (or logical key); null when it is not a player part. */
export function partGender(key: string): Gender | null {
  const stem = stemOf(key);
  if (/^part_(m|male)/.test(stem)) return 'male';
  if (/^part_(f|female)/.test(stem)) return 'female';
  return null;
}

/** The slot a part fills, from its stem (or logical key). */
export function partSlot(key: string): PartSlot {
  const stem = stemOf(key);
  if (/head\d*$/.test(stem)) return 'head';
  if (/hair\d*$/.test(stem)) return 'hair';
  if (/cap$/.test(stem)) return 'cap';
  if (/upper$/.test(stem)) return 'upper';
  if (/hand$/.test(stem)) return 'hand';
  if (/foot$/.test(stem)) return 'foot';
  return 'other';
}

export const partKey = (stem: string): string => `models/${stem}.glb`;
export const skeletonKey = (gender: Gender): string => `skeletons/mvr_${gender}.glb`;
export const motionKey = (gender: Gender, motion: string): string => `motions/mvr_${gender}/${motion}.glb`;

/** The `gender` parts among `keys` (logical keys; anything that is not a part model is skipped), by slot, sorted. */
export function partsBySlot(keys: Iterable<string>, gender: Gender): Record<PartSlot, string[]> {
  const slots = Object.fromEntries(PART_SLOTS.map((slot) => [slot, [] as string[]])) as Record<PartSlot, string[]>;
  for (const key of keys) {
    const stem = PART_KEY.exec(key)?.[1];
    if (stem !== undefined && partGender(stem) === gender) slots[partSlot(stem)].push(stem);
  }
  for (const slot of PART_SLOTS) slots[slot].sort();
  return slots;
}

/** DEFAULT_MALE; for a female, the first part (alphabetically) of each slot DEFAULT_MALE fills. */
export function defaultParts(gender: Gender, bySlot: Record<PartSlot, string[]>): Outfit {
  if (gender === 'male') return { ...DEFAULT_MALE };
  const outfit: Outfit = {};
  for (const slot of PART_SLOTS) {
    const first = bySlot[slot][0];
    if (slot in DEFAULT_MALE && first !== undefined) outfit[slot] = first;
  }
  return outfit;
}

export interface CharacterParams {
  gender: Gender;
  parts: Outfit;
  /** The motion's stem (`mvr_male_genstand`). */
  motion: string;
  /** Holds the pose at `frame` instead of playing. */
  paused: boolean;
  /** The frame the motion starts at (or holds, when paused). */
  frame: number;
}

/** A parameter value that takes the part off its slot. */
export const NO_PART = 'none';

/**
 * Reads the parameters of `#/character?gender=male&head=…&motion=…&frame=0&paused=1` over the defaults: `gender`
 * (male unless `female`), one per slot (`none` or empty takes that slot's part off), `motion`, `paused` (`1` or
 * `true`) and `frame` (a whole number, else 0). `keys` are the asset index's keys, for the female defaults.
 */
export function readCharacterParams(params: URLSearchParams, keys: Iterable<string>): CharacterParams {
  const gender: Gender = params.get('gender') === 'female' ? 'female' : 'male';
  const parts = defaultParts(gender, partsBySlot(keys, gender));
  for (const slot of PART_SLOTS) {
    const value = params.get(slot);
    if (value === null) continue;
    if (value === '' || value === NO_PART) delete parts[slot];
    else parts[slot] = value;
  }
  const frame = Number(params.get('frame') ?? '0');
  const paused = params.get('paused');
  return {
    gender,
    parts,
    motion: params.get('motion') || DEFAULT_MOTION[gender],
    paused: paused === '1' || paused === 'true',
    frame: Number.isInteger(frame) && frame >= 0 ? frame : 0,
  };
}
