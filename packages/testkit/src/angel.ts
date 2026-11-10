// 2026-11-10: Summon Angel's snapshots as the world server writes them (docs/superpowers/specs/2026-11-10-summon-angel-research.md):
// SNAPSHOTTYPE_ANGEL with ANGEL_INFO (`CUser::AddAngelInfo`: the EXP, the level and whether it just became full) and
// SNAPSHOTTYPE_SET_LOCAL_EVENT (`short id, BYTE state`, read by `CDPClient::OnSetLocalEvent`, Neuz/DPClient.cpp:6260-6265).

import { ANGEL_INFO, ArWriter, MessageType } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

/** ANGEL INFO about the player: its EXP, level and `bComplete` (DPClient.cpp:11337-11354). */
export function writeAngelInfo(objectId: number, exp: bigint, level: number, complete = false): ScriptMessage {
  const fields = new ArWriter().u8(ANGEL_INFO).i64(exp).i32(level).i32(complete ? 1 : 0).toBytes();
  return { objectId, type: MessageType.ANGEL, fields };
}

/** FLYFF_EVENT: the 1024 states of `g_eLocal`, `on` the ones set (an id to its state). */
export function writeFlyffEvent(objectId: number, on: Readonly<Record<number, number>> = {}): ScriptMessage {
  const states = new Uint8Array(1024);
  for (const [id, state] of Object.entries(on)) states[Number(id)] = state;
  return { objectId, type: MessageType.FLYFF_EVENT, fields: new ArWriter().bytes(states).toBytes() };
}

/** SET_LOCAL_EVENT: the event `id` (an EVE_* of `_Common/flyffevent.h`) on (1) or off (0). */
export function writeSetLocalEvent(objectId: number, id: number, state: number): ScriptMessage {
  return { objectId, type: MessageType.SET_LOCAL_EVENT, fields: new ArWriter().i16(id).u8(state).toBytes() };
}
