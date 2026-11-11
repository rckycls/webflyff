// 2026-11-11: the honour titles' snapshots as the world server writes them: `CUser::AddHonorListAck` (the own counts, object
// the own player, `WORLDSERVER/User.cpp:7996-8008`) and `CUserMng::AddHonorTitleChange` (a mover's title, object that mover,
// User.cpp:7906-7918), in the order of the readers (`@flyffweb/protocol` world/honor.ts).

import { ArWriter, HonorMessageType, MAX_HONOR_TITLE } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

/** `MAX_HONOR_TITLE` counts, with `counts` (id -> count) set and the others 0. */
export function honorCounts(counts: Readonly<Record<number, number>> = {}): number[] {
  return Array.from({ length: MAX_HONOR_TITLE }, (_, id) => counts[id] ?? 0);
}

/** HONOR_LIST_ACK: the own counts (`honorCounts`), to the own player. */
export function writeHonorList(objectId: number, counts: readonly number[]): ScriptMessage {
  if (counts.length !== MAX_HONOR_TITLE) throw new Error(`HONOR_LIST_ACK carries ${MAX_HONOR_TITLE} counts, not ${counts.length}`);
  const w = new ArWriter();
  for (const count of counts) w.i32(count);
  return { objectId, type: HonorMessageType.HONOR_LIST_ACK, fields: w.toBytes() };
}

/** HONOR_CHANGE_ACK: the title the mover `objectId` now shows, -1 for none. */
export function writeHonorChange(objectId: number, honor: number): ScriptMessage {
  return { objectId, type: HonorMessageType.HONOR_CHANGE_ACK, fields: new ArWriter().i32(honor).toBytes() };
}
