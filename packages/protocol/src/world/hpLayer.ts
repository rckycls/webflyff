// Layered boss HP (2026-11-11): the server's bar count of a monster with more than one HP bar. An owner-approved server
// addition (outer repo branch `layered-boss-hp`, design docs/superpowers/specs/2026-11-02-layered-boss-hp-design.md),
// not stock V15: the world server sends it only for a monster its `Resource/LayeredBossHp.inc` gives more than one bar.
//
//   snapshot  SNAPSHOTTYPE_HP_LAYER 0x9A00 (Source/_Network/MsgHdr.h), object the monster:
//             int bars left (the current one included), int bars at spawn, int max HP of one bar, int current HP
//             (CUser::AddHpLayer after the monster's ADD_OBJ, for every viewer that gets it; CUserMng::AddHpLayer on each
//             change of bar, after the hit's DAMAGE, and on a leash reset; WORLDSERVER/User.cpp)
//   Neuz      CDPClient::OnHpLayer (Neuz/DPClient.cpp): m_nHpBars, m_nHpBarsMax, then SetPointParam( DST_HP, hp )
//
// Display only: the server owns the bars, and nothing the client sends can change them.

import type { ArReader } from '../ar/ArReader';

/** The snapshot's type (`MsgHdr.h`). */
export const HpLayerMessageType = { HP_LAYER: 0x9a00 } as const;

export type HpLayerMessage = {
  type: 'hpLayer';
  /** `m_nHpBars`: bars left, the current one included (1: the last bar). */
  bars: number;
  /** `m_nHpBarsMax`: bars at spawn. */
  barsMax: number;
  /** `GetMaxHitPoint()` on the server: the max HP of one bar. */
  barMaxHp: number;
  /** `m_nHitPoint`: the current bar's HP. */
  hp: number;
};

export function readHpLayer(r: ArReader): HpLayerMessage {
  const bars = r.i32();
  const barsMax = r.i32();
  const barMaxHp = r.i32();
  const hp = r.i32();
  return { type: 'hpLayer', bars, barsMax, barMaxHp, hp };
}

export const HP_LAYER_READERS: ReadonlyArray<[number, (r: ArReader) => HpLayerMessage]> = [
  [HpLayerMessageType.HP_LAYER, readHpLayer],
];
