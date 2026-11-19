// custom (owner 2026-11-19): Bozman's Craft Card's rules (docs/superpowers/specs/2026-11-19-craft-card-design.md). The World
// decides everything (outer repo Source/WORLDSERVER/CraftCard.h); this copy only shows the chance, fills the slots and
// caps the bulk number. Change both together.
//
//   points: 2% / D = 5, 3% / C = 10, 4% / B = 20; +5 for each card after the first; never past 90
//   results: a random 7% suit card or a random A weapon card (5 families each, equal odds)
//   tries: VIP1 'A' 5, VIP2 'B' 10, VIP3 'C' 15, VIP4 'E' 20, a game master ('L' and up) 20, anyone else 1

import type { WebItemProp } from '@flyffweb/formats';
import { AUTH_GAMEMASTER } from '../authorization';

/** `II_GEN_MAT_CRAFTSTONE` (outer repo `Resource/defineItem.h`): the crafting material. */
export const CRAFT_STONE = 20280;
/** `CRAFTCARD_MAX_CARDS`, `CRAFTCARD_MAX_CHANCE`. */
export const CRAFT_CARD_MAX_CARDS = 5;
const MAX_CHANCE = 90;

export type CardKind = 'suit' | 'weapon';

/** Suit 2%, 3%, 4% (II_GEN_MAT_ELE_*: Volcano, Ocean, Lightning, Earthquake, Vacuum). */
const SUIT_2 = [3204, 3209, 3214, 3219, 3224];
const SUIT_3 = [3255, 3256, 3258, 3259, 3257];
const SUIT_4 = [3207, 3212, 3217, 3222, 3227];
/** Weapon D (Fire, Water, Wind, Electric, Land); C = D + 1, B = D + 2, A = D + 3. */
const WEAPON_D = [26594, 26598, 26602, 26606, 26610];

type CardInput = { kind: CardKind; points: number };
const input = (kind: CardKind, points: number) => (id: number): [number, CardInput] => [id, { kind, points }];
const INPUTS: ReadonlyMap<number, CardInput> = new Map([
  ...SUIT_2.map(input('suit', 5)),
  ...SUIT_3.map(input('suit', 10)),
  ...SUIT_4.map(input('suit', 20)),
  ...WEAPON_D.map(input('weapon', 5)),
  ...WEAPON_D.map((id) => id + 1).map(input('weapon', 10)),
  ...WEAPON_D.map((id) => id + 2).map(input('weapon', 20)),
]);

/** The ten results: the 7% suit cards and the A weapon cards. */
const TOP_CARDS: ReadonlySet<number> = new Set([3208, 3213, 3218, 3223, 3228, ...WEAPON_D.map((id) => id + 3)]);

/** A card the window takes, its kind and points; null for anything else. */
export function cardInput(itemId: number): CardInput | null {
  return INPUTS.get(itemId) ?? null;
}

export function isTopCard(itemId: number): boolean {
  return TOP_CARDS.has(itemId);
}

/** In whole percent, as the World works it out (`CraftCardChance`). Not an input counts as nothing. */
export function craftChance(itemIds: readonly number[]): number {
  const inputs = itemIds.map(cardInput).filter((input) => input !== null);
  if (inputs.length === 0) return 0;
  const points = inputs.reduce((sum, input) => sum + input.points, 0);
  return Math.min(MAX_CHANCE, points + 5 * (inputs.length - 1));
}

/** The tries a character's letter allows (`CraftCardMaxTries`). */
export function maxTries(authorization: number): number {
  switch (String.fromCharCode(authorization)) {
    case 'A': return 5;
    case 'B': return 10;
    case 'C': return 15;
    case 'E': return 20;
    default: return authorization >= AUTH_GAMEMASTER ? 20 : 1;
  }
}

/**
 * How many tries the stacks in the window pay for: each stack's pieces over the slots it fills, the stone's included; 0
 * without a stone or a card.
 */
export function affordableTries(
  stoneId: number | null, cardIds: ReadonlyArray<number | null>, countOf: (objectId: number) => number,
): number {
  const cards = cardIds.filter((id): id is number => id !== null);
  if (stoneId === null || cards.length === 0) return 0;
  const uses = new Map<number, number>([[stoneId, 1]]);
  for (const id of cards) uses.set(id, (uses.get(id) ?? 0) + 1);
  return Math.min(...[...uses].map(([id, use]) => Math.floor(countOf(id) / use)));
}

/**
 * The Craft Stone as the catalog would have it. The converter builds `itemProps.json` from the client's packs, which never
 * had this custom item, so the game data adds it when it is missing (as the Grey Wolf Mount, `groundMount.ts`). Kept in
 * step with the server's row (a copy of the never-obtained Mineral's: IK1_GENERAL, IK2_MATERIAL, IK3_SUPSTONE, its
 * picture and model), stacking to 99.
 */
export const CRAFT_STONE_PROP: WebItemProp = {
  id: CRAFT_STONE,
  name: 'Craft Stone',
  description: 'A stone used for crafting. Bozman in Saint Morning uses it to craft piercing cards.',
  cost: 100,
  packMax: 99,
  kind1: 3,
  kind2: 17,
  kind3: 39,
  handed: -1,
  part: -1,
  abilityMin: -1,
  abilityMax: -1,
  weaponType: -1,
  attackSpeed: -1,
  attackRange: -1,
  destParams: [-1, -1, -1],
  adjParams: [-1, -1, -1],
  sfxHit: -1,
  sfxMissile: -1,
  linkKindBullet: -1,
  model: 'models/item_genmatsupresour.glb',
  dropModel: 'models/item_genmatsupresour.glb',
  icon: 'ui/item/itm_genmatsupminera.png',
  itemLevel: 1,
  limitLevel: 1,
  permanence: 1,
};

/** The catalog with the Craft Stone, added when the converted catalog lacks it. */
export function withCraftStone(props: Map<number, WebItemProp>): Map<number, WebItemProp> {
  if (!props.has(CRAFT_STONE)) props.set(CRAFT_STONE, CRAFT_STONE_PROP);
  return props;
}
