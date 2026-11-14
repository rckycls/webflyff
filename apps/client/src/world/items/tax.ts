// The tax an item tooltip's shop prices count (2026-11-15, item tooltip gaps): CTax's client part
// (Source/_Common/Tax.cpp) and the continent it asks for (CContinent, Source/_Common/Continent.cpp).
//
//   CTax::GetContinent        Tax.cpp:96-99        CContinent::GetArea( pMover )
//   CContinent::GetContinent  Continent.cpp:256-270, :287-303   Madrigal: the first outline (ascending id) holding the
//                             truncated (x, z); the Arena: CONT_DARKON12; the guild war world: CONT_FLARIS; else none
//   CContinent::GetArea       Continent.cpp:320-343   none stays none; up to CONT_EAST east; from CONT_WEST west
//   CTax::GetSalesTaxRate,    Tax.cpp:101-139      the area's `nTaxRate * 0.1f * 0.1f` (TAX_SALES, TAX_PURCHASE); 0 for
//   GetPurchaseTaxRate                             none
//   CTax::IsApplyTaxRate      Tax.cpp:142-160      in an area, and not perin, the red chip or the two awakening scrolls
//   CDPClient::OnTaxInfo      Neuz/DPClient.cpp:17757-17762   TAX_ALLINFO fills the rates (protocol world/tax.ts)

import type { TaxMessage } from '@flyffweb/protocol';
import { pointInPoly } from '../worldMapRules';

/** `ContinentDef.h`: no continent, the east and west areas, Flaris, Darkon 1-2. */
const CONT_NODATA = 0;
const CONT_FLARIS = 1;
const CONT_EAST = 15;
const CONT_WEST = 240;
const CONT_DARKON12 = 241;
/** `defineWorld.h`: WI_WORLD_MADRIGAL, WI_WORLD_GUILDWAR, WI_WORLD_ARENA. */
const WI_WORLD_MADRIGAL = 1;
const WI_WORLD_GUILDWAR = 202;
const WI_WORLD_ARENA = 208;
/** `Tax.h:6-7`: TAX_SALES, TAX_PURCHASE. */
const TAX_SALES = 0;
const TAX_PURCHASE = 1;
/** II_SYS_SYS_SCR_PERIN, II_CHP_RED, II_SYS_SYS_SCR_AWAKE, II_SYS_SYS_SCR_PETAWAKE (defineItem.h). */
const UNTAXED: ReadonlySet<number> = new Set([26456, 26460, 26461, 20024]);

/** The rates of the area the player stands in, as the floats CTax gives. */
export interface TooltipTax {
  sales: number;
  purchase: number;
}

/** The continents' outlines (`data/worldMap.json`), in ascending id. */
export type ContinentOutlines = ReadonlyArray<{ id: number; ring: ReadonlyArray<readonly [number, number]> }>;

/** `CContinent::GetArea( pMover )`: `CONT_EAST`, `CONT_WEST`, or 0 (none). */
export function taxArea(worldId: number, pos: { x: number; z: number }, continents: ContinentOutlines): number {
  let continent = CONT_NODATA;
  if (worldId === WI_WORLD_MADRIGAL) {
    const x = Math.trunc(pos.x), z = Math.trunc(pos.z);
    continent = continents.find((each) => pointInPoly(x, z, each.ring))?.id ?? CONT_NODATA;
  } else if (worldId === WI_WORLD_ARENA) {
    continent = CONT_DARKON12;
  } else if (worldId === WI_WORLD_GUILDWAR) {
    continent = CONT_FLARIS;
  }
  if (continent === CONT_NODATA) return CONT_NODATA;
  if (continent <= CONT_EAST) return CONT_EAST;
  return continent >= CONT_WEST ? CONT_WEST : CONT_NODATA;
}

/** `CTax::IsApplyTaxRate`'s item test (the area is the caller's). */
export const taxApplies = (itemId: number): boolean => !UNTAXED.has(itemId);

/** `static_cast<float>(nTaxRate) * 0.1f * 0.1f`. */
const rateOf = (percent: number): number => Math.fround(Math.fround(Math.fround(percent) * Math.fround(0.1)) * Math.fround(0.1));

/** `CTax::m_mapTaxInfo` as TAX_ALLINFO fills it: each continent's rates by kind (0 until they come, as `__TAXDETAIL`'s). */
export class TaxBook {
  private readonly continents = new Map<number, Map<number, number>>();

  apply(message: TaxMessage): void {
    for (const { continent, rates } of message.continents) {
      const kinds = this.continents.get(continent) ?? new Map<number, number>();
      for (const { kind, rate } of rates) kinds.set(kind, rate);
      this.continents.set(continent, kinds);
    }
  }

  /** The sales and purchase rates of `area`; 0 for none (`CONT_NODATA`) or one with no rates. */
  rates(area: number): TooltipTax {
    if (area === CONT_NODATA) return { sales: 0, purchase: 0 };
    const kinds = this.continents.get(area);
    return { sales: rateOf(kinds?.get(TAX_SALES) ?? 0), purchase: rateOf(kinds?.get(TAX_PURCHASE) ?? 0) };
  }
}

/** The tax where the player stands, or null off every continent (no tax, no "Before tax price" line). */
export function tooltipTax(
  book: TaxBook, worldId: number, pos: { x: number; z: number }, continents: ContinentOutlines | undefined,
): TooltipTax | null {
  const area = taxArea(worldId, pos, continents ?? []);
  return area === CONT_NODATA ? null : book.rates(area);
}
