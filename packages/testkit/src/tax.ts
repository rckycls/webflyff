// 2026-11-15 (item tooltip gaps): SNAPSHOTTYPE_TAX_ALLINFO as the world server writes it (`CUser::AddTaxInfo`,
// WORLDSERVER/User.cpp:8366-8373; `CTax::Serialize`'s storing side, Source/_Common/Tax.cpp:393-415), in the order of the
// reader (`@flyffweb/protocol` world/tax.ts).

import { ArWriter, TaxMessageType } from '@flyffweb/protocol';
import type { TaxContinent } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

/** TAX_ALLINFO to the player `objectId`: each continent, its guild and its rates. */
export function writeTaxInfo(objectId: number, continents: readonly TaxContinent[]): ScriptMessage {
  const w = new ArWriter().i32(continents.length);
  for (const { continent, guildId, rates } of continents) {
    w.u8(continent).u32(guildId).i32(rates.length);
    for (const { kind, rate } of rates) w.u8(kind).i32(rate);
  }
  return { objectId, type: TaxMessageType.TAX_ALLINFO, fields: w.toBytes() };
}
