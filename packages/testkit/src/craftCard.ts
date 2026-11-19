// custom (owner 2026-11-19): Bozman's Craft Card's answer as the World's patch writes it (`CUser::AddCraftCard`, under the
// player's own id, outer repo patches/2026-11-19-craft-card.patch), in the order of the reader (`@flyffweb/protocol`
// world/craftCard.ts).

import { ArWriter, CraftCardMessageType } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

/** CRAFT_CARD: the code, then one item id per try run (0 for a fail). */
export function writeCraftCard(objectId: number, code: number, made: readonly number[]): ScriptMessage {
  const w = new ArWriter().u8(code).u8(made.length);
  for (const id of made) w.u32(id);
  return { objectId, type: CraftCardMessageType.CRAFT_CARD, fields: w.toBytes() };
}
