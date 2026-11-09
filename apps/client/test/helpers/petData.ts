// pets R2: the raised pets' test data (Resource/pet.inc, propItem.txt, textClient's English) and the own ADD_OBJ with a
// pet item, as the testkit's world server writes it and the protocol reads it.

import { NULL_ID, PacketType, WORLD_READERS, readBundle } from '@flyffweb/protocol';
import type { AddedMover, InventoryItem, PetData, WorldMessage } from '@flyffweb/protocol';
import { encodeBundle, newVagrantOwn, writeAddSelf } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import type { WebItemProp, WebPets } from '@flyffweb/formats';
import type { GameData } from '../../src/world/gameData';
import type { UiArt } from '../../src/world/hud/art';
import { II_PET_EGG, MI_PET_EGG } from '../../src/world/pets/raisedPet';
import { addedPlayer, webMoverOf } from './movers';
import { OWN_ID, itemProp, ownGameData } from './ownState';

export const f32 = Math.fround;
export const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

export const MI_TIGER_D = 732;
export const MI_TIGER_B = 733;
export const MI_TIGER_S = 884;
export const II_TIGER = 21039;
export const II_UNICORN = 21045;
export const II_FEED_POCKET = 21035;
export const EGG_SLOT = 3;
export const STEPS = [1, 2, 4, 7, 11, 16, 22, 29, 37];

export const PETS: WebPets = {
  kinds: [
    { kind: 0, dst: 1, steps: STEPS, itemId: II_TIGER, models: [MI_TIGER_D, MI_TIGER_B, MI_TIGER_S], hatchWeight: 900 },
    ...[1, 2, 3, 4, 5].map((kind) => ({ kind, dst: 2, steps: STEPS, itemId: 0, models: [0, 0, 0] as [number, number, number], hatchWeight: 0 })),
    { kind: 6, dst: 52, steps: STEPS, itemId: II_UNICORN, models: [MI_TIGER_D, MI_TIGER_B, MI_TIGER_S], hatchWeight: 1675 },
  ],
  feedEnergy: [[], []], incrementExp: [250, 125, 62, 31], maxEnergy: [180, 300, 420, 600, 1500],
  penalty: [{ exp: f32(0.16), energy: 0 }],
};

export const TEXTS: Record<string, string> = {
  TID_GAME_PET_STATUS_LEVEL: 'Level', TID_GAME_PET_STATUS_ABILITY: 'Ability', TID_GAME_PET_STATUS_HP: 'P.Hp',
  TID_GAME_PET_STATUS_EXP: 'Exp', TID_GAME_PET_EGG_ABILITY: 'None', TID_GAME_PETGRADE_E: 'Egg', TID_GAME_PETGRADE_D: 'D Level',
  TID_GAME_PETGRADE_C: 'C Level', TID_GAME_PETGRADE_B: 'B Level', TID_GAME_PETGRADE_A: 'A Level', TID_GAME_PETGRADE_S: 'S Level',
  TID_GAME_CAGE_STRING: '%s Cage', TID_TOOLTIP_STR: 'STR', TID_TOOLTIP_DST_HP_MAX_RATE: 'Increased HP',
  TID_GAME_CHARACTER_02: 'Level', TID_GAME_ABILITY: 'Bonus', TID_GAME_PET_TOOLTIP_LEVEL: 'Lv%d',
  TID_GAME_PET_TOOLTIP_EXP: 'Exp : %.2f%%', TID_GAME_PET_TOOLTIP_EXP_MAX: 'Exp : 99.99%%', TID_GAME_PET_TOOLTIP_LIFE: 'Life : %d',
  TID_GAME_PET_TOOLTIP_HP: 'P.Hp : %d / %d', TID_GAME_PETINFO_DEAD: '(Death)', TID_TOOLTIP_PET_REAR: '[Raised Pet]',
  TID_GAME_AWAKENNIG_PET_00: 'Awakenable', TID_GAME_POCKETUSING: '(Active)', TID_GAME_POCKET_NOTUSING: '(Inactive)',
  TID_GAME_PET_FEED_COUNT: 'Pet food count:', TID_GAME_PET_FEEDPOCKET: 'Eats the food in the bag.',
  TID_GAME_PET_FEEDPOCKET_USE: 'Double-click to use.',
};

export const petItemProp = (id: number, name: string, icon: string): WebItemProp =>
  itemProp({ id, name, kind1: 3, kind2: 1, kind3: 120, part: -1, icon, description: `${name}'s words.` });

export function petData(): GameData {
  return ownGameData({
    movers: new Map([
      [11, webMoverOf({ index: 11, name: 'Male', ai: 1, speed: 0.1 })],
      [MI_PET_EGG, webMoverOf({ index: MI_PET_EGG, name: 'Egg', ai: 9, belligerence: 1, speed: 0.1, model: 'models/mvr_petegg.glb' })],
      ...[MI_TIGER_D, MI_TIGER_B, MI_TIGER_S].map((index) => [index, webMoverOf({ index, name: 'White Tiger', ai: 9, belligerence: 1, speed: 0.1 })] as const),
    ]),
    itemProps: new Map([
      ...ownGameData().itemProps,
      [II_PET_EGG, petItemProp(II_PET_EGG, 'Pet Egg', 'ui/item/itm_petegg.png')],
      [II_TIGER, petItemProp(II_TIGER, 'White Tiger', 'ui/item/itm_petwhitetiger01.png')],
      [II_UNICORN, petItemProp(II_UNICORN, 'Unicorn', 'ui/item/itm_petunicorn01.png')],
      [II_FEED_POCKET, itemProp({ id: II_FEED_POCKET, name: 'Pet Feed Pocket', kind2: 19, kind3: 0, part: -1 })],
      [30000, itemProp({ id: 30000, name: 'Grilled Eel', kind2: 14, part: -1, icon: 'ui/item/itm_eel.png' })],
      [100, itemProp({ id: 100, name: 'Charm', kind2: 33, part: -1, icon: 'ui/item/itm_charm.png' })],
    ]),
    texts: new Map(Object.entries(TEXTS).map(([id, text]) => [id, { id, text, color: 0xff000000 }])),
    pets: PETS,
  });
}

export const pet = (over: Partial<PetData> = {}): PetData => ({
  kind: 0, level: 0, exp: 0, energy: 1, life: 1, availLevels: [0, 0, 0, 0, 0, 0], name: '', ...over,
});
export const petItem = (p: PetData, over: Partial<InventoryItem> = {}): InventoryItem => ({
  objectId: EGG_SLOT, itemId: p.level === 0 ? II_PET_EGG : p.kind === 6 ? II_UNICORN : II_TIGER, count: 1, pet: p, ...over,
});
/** A C-level tiger with steps 1 and 3 (+1 and +4 STR), 3 lives, 150 of 300 energy, 12.345% EXP. */
export const TIGER_C = pet({ level: 2, exp: 12345, energy: 150, life: 3, availLevels: [1, 3, 0, 0, 0, 0] });

/** Each line's runs as one text. */
export const texts = (lines: ReadonlyArray<ReadonlyArray<{ text: string }>>): string[] => lines.map((line) => line.map((run) => run.text).join(''));

/** The messages of a bundle the world server would send, read back as the browser reads them. */
export function read(messages: ScriptMessage[]): Array<{ objectId: number; value: WorldMessage }> {
  return readBundle(encodeBundle(PacketType.SNAPSHOT, OWN_ID, messages), WORLD_READERS).messages;
}

/** The own ADD_OBJ: a Vagrant with `bagPet` in bag slot 3, which is out (`petSlot`) when `out`. */
export function ownAddObj(bagPet: PetData, out: boolean): AddedMover {
  const own = newVagrantOwn();
  const inventory: InventoryItem[] = [...own.inventory!];
  inventory.splice(3, 0, petItem(bagPet));
  const added = addedPlayer(OWN_ID, {
    self: true, own: { ...own, inventory, petSlot: out ? EGG_SLOT : NULL_ID }, equipmentObjectIds: new Array<number>(31).fill(NULL_ID),
  }, { hitPoint: 230 });
  const [message] = read([writeAddSelf(OWN_ID, added)]);
  if (message?.value.type !== 'addMover') throw new Error('the own ADD_OBJ was not read');
  return message.value.mover;
}
