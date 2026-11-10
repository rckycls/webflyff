// 2026-11-10: the jewel windows' answers as the world server writes them (docs/superpowers/specs/2026-11-10-jewels-research.md
// §5): ULTIMATE 0x0100, a BYTE state and an int result (`CUser::AddUltimateWeapon`, `WORLDSERVER/User.cpp:7833-7842`);
// Create Jewels' also the count of jewels made (`AddUltimateMakeGem`, :7821-7831).

import { ArWriter, MessageType, UltimateState } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

/** ULTIMATE about the player: `state` (UltimateState) and `result` (UltimateResult); MAKEGEM's `count` (0 when none). */
export function writeUltimate(objectId: number, state: number, result: number, count = 0): ScriptMessage {
  const w = new ArWriter().u8(state).i32(result);
  if (state === UltimateState.MAKEGEM) w.i32(count);
  return { objectId, type: MessageType.ULTIMATE, fields: w.toBytes() };
}
