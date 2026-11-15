// The tax rates (2026-11-15, item tooltip gaps): what the shop prices in an item tooltip add or take off, and the
// "Before tax price" line (CWndMgr::PutItemGold, Source/_Interface/WndManager.cpp:5676-5805).
//
//   snapshot  SNAPSHOTTYPE_TAX_ALLINFO 0x0400 (Source/_Network/MsgHdr.h:1223), CUser::AddTaxInfo (WORLDSERVER/User.cpp:8366-8373)
//             at join and for everyone when a rate changes (DPDatabaseClient.cpp:1193, :3611): CTax::Serialize, the
//             storing side (Source/_Common/Tax.cpp:393-415): `m_mapTaxInfo.size()` (a size_t, 4 bytes on x86), then per
//             continent BYTE continent, DWORD dwId (the guild that holds it, NULL_ID for none), the detail map's size,
//             then per kind BYTE kind, int nTaxRate. The DB server's bSetTaxRate and dwNextId are not sent to Neuz.
//   Neuz      CDPClient::OnTaxInfo (Neuz/DPClient.cpp:17757-17762): CTax::Serialize's loading side (Tax.cpp:416-440)
//
// The continents are CONT_EAST 15, CONT_WEST 240 and CONT_ALL 255 (the Lord), as CTax's constructor makes them
// (Tax.cpp:23-31); the kinds TAX_SALES 0, TAX_PURCHASE 1 and TAX_ADMISSION 2 (Tax.h:6-8). A rate is a percentage.

import type { ArReader } from '../ar/ArReader';

/** The snapshot's type (`MsgHdr.h`). */
export const TaxMessageType = { TAX_ALLINFO: 0x0400 } as const;

export interface TaxContinent {
  /** The map's BYTE key: `CONT_EAST` 15, `CONT_WEST` 240, `CONT_ALL` 255. */
  continent: number;
  /** `__TAXINFO::dwId`: the guild (or Lord) that sets the rates; `NULL_ID` for none. */
  guildId: number;
  /** `mapTaxDetail`: each kind's `nTaxRate`, in the order sent. */
  rates: Array<{ kind: number; rate: number }>;
}

export type TaxMessage = { type: 'taxInfo'; continents: TaxContinent[] };

export function readTaxInfo(r: ArReader): TaxMessage {
  const count = r.i32(); // ar >> nSize (int)
  const continents: TaxContinent[] = [];
  for (let i = 0; i < count; i++) {
    const continent = r.u8(); // ar >> nCont (BYTE)
    const guildId = r.u32(); // ar >> taxInfo->dwId (DWORD)
    const kinds = r.i32(); // ar >> nSize2 (int)
    const rates: Array<{ kind: number; rate: number }> = [];
    for (let j = 0; j < kinds; j++) rates.push({ kind: r.u8(), rate: r.i32() }); // nTaxKind (BYTE), nTaxRate (int)
    continents.push({ continent, guildId, rates });
  }
  return { type: 'taxInfo', continents };
}

export const TAX_READERS: ReadonlyArray<[number, (r: ArReader) => TaxMessage]> = [
  [TaxMessageType.TAX_ALLINFO, readTaxInfo],
];
