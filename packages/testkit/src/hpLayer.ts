// 2026-11-11: layered boss HP, a server addition: SNAPSHOTTYPE_HP_LAYER as the world server writes it
// (`CUser::AddHpLayer` / `CUserMng::AddHpLayer`, object the monster, WORLDSERVER/User.cpp), in the order of the reader
// (`@flyffweb/protocol` world/hpLayer.ts).

import { ArWriter, HpLayerMessageType } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

/** HP_LAYER: `bars` left (the current one included) of `barsMax`, one bar's max HP, and the current bar's HP. */
export function writeHpLayer(objectId: number, bars: number, barsMax: number, barMaxHp: number, hp: number): ScriptMessage {
  const fields = new ArWriter().i32(bars).i32(barsMax).i32(barMaxHp).i32(hp).toBytes();
  return { objectId, type: HpLayerMessageType.HP_LAYER, fields };
}
