// 2026-11-17 (view-equip-options): SNAPSHOTTYPE_QUERYEQUIP as the world server writes it (`CUser::AddQueryEquip`,
// WORLDSERVER/User.cpp:2860-2891), in the order of the reader (`@flyffweb/protocol` world/queryEquip.ts).

import { ArWriter, QUERYEQUIP_SNAPSHOT } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

/** One worn part's extras; the omitted ones are 0 or empty. */
export interface QueryEquipPartScript {
  part: number;
  randomOption?: bigint;
  piercing?: readonly number[];
  ultimate?: readonly number[];
  resist?: number;
  resistOption?: number;
}

/** QUERYEQUIP about the player `objectId`: the extras of its worn parts. */
export function writeQueryEquip(objectId: number, parts: readonly QueryEquipPartScript[]): ScriptMessage {
  const w = new ArWriter().i32(parts.length);
  for (const part of parts) {
    w.i32(part.part).i64(part.randomOption ?? 0n);
    for (const list of [part.piercing ?? [], part.ultimate ?? []]) {
      w.u32(list.length);
      for (const id of list) w.u32(id);
    }
    w.u32(0); // the vis keep times (none for a worn item)
    w.u8(part.resist ?? 0).i32(part.resistOption ?? 0);
  }
  return { objectId, type: QUERYEQUIP_SNAPSHOT, fields: w.toBytes() };
}
