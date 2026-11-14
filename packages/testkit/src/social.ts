// 2026-11-15 (social): the couple's and the duels' snapshots as the world server writes them (`CUser::AddCouple` ...,
// `WORLDSERVER/User.cpp:3753-3846`; `CUser::AddDuel*`, `AddSetDuel`, `CUserMng::AddAddRegion`, :1680-1816, :7472-7505), in
// the order of the readers (`@flyffweb/protocol` world/couple.ts, world/duel.ts).

import { ArWriter, CoupleMessageType, DuelMessageType, NULL_ID, REGIONELEM_SIZE } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter = new ArWriter()): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/** SNAPSHOTTYPE_COUPLE: the couple's EXP and its two players. */
export const writeCouple = (ownId: number, exp: number, first: number, second: number): ScriptMessage =>
  scripted(ownId, CoupleMessageType.COUPLE, new ArWriter().i32(exp).u32(first).u32(second));

/** PROPOSE_RESULT: a proposal from `proposerId` named `name`. */
export const writeProposeResult = (ownId: number, proposerId: number, name: string): ScriptMessage =>
  scripted(ownId, CoupleMessageType.PROPOSE_RESULT, new ArWriter().u32(proposerId).string(name));

/** COUPLE_RESULT: the couple made with `partnerId`. */
export const writeCoupleResult = (ownId: number, partnerId: number, name: string): ScriptMessage =>
  scripted(ownId, CoupleMessageType.COUPLE_RESULT, new ArWriter().u32(partnerId).string(name));

/** DECOUPLE_RESULT. */
export const writeDecoupleResult = (ownId: number): ScriptMessage => scripted(ownId, CoupleMessageType.DECOUPLE_RESULT);

/** ADD_COUPLE_EXPERIENCE. */
export const writeAddCoupleExperience = (ownId: number, exp: number): ScriptMessage =>
  scripted(ownId, CoupleMessageType.ADD_COUPLE_EXPERIENCE, new ArWriter().i32(exp));

/** DUELREQUEST or DUELPARTYREQUEST: the asker's and the asked one's idPlayer. */
export const writeDuelRequest = (ownId: number, asker: number, asked: number, party = false): ScriptMessage =>
  scripted(ownId, party ? DuelMessageType.DUELPARTYREQUEST : DuelMessageType.DUELREQUEST, new ArWriter().u32(asker).u32(asked));

/** DUELSTART: the other's idPlayer and the flag (0 start, 1 fight, 3 won, 4 lost). */
export const writeDuelStart = (ownId: number, target: number, flag: number): ScriptMessage =>
  scripted(ownId, DuelMessageType.DUELSTART, new ArWriter().u32(target).i32(flag));

/** DUELNO: the one who refused. */
export const writeDuelNo = (ownId: number, refuserId: number): ScriptMessage =>
  scripted(ownId, DuelMessageType.DUELNO, new ArWriter().u32(refuserId));

/** DUELCOUNT. */
export const writeDuelCount = (ownId: number, count: number): ScriptMessage =>
  scripted(ownId, DuelMessageType.DUELCOUNT, new ArWriter().i32(count));

/** SETDUEL about `objectId`. */
export const writeSetDuel = (ownId: number, objectId: number, duel: number, state: number, other = NULL_ID, duelParty = 0): ScriptMessage =>
  scripted(ownId, DuelMessageType.SETDUEL, new ArWriter().u32(objectId).i32(duel).i32(state).u32(other).u32(duelParty));

/** ADDREGION: the /ctd Duel Zone (RA_DANGER | RA_FIGHT) over `rect` (x left, z top, x right, z bottom) of `worldId`. */
export function writeAddRegion(worldId: number, rect: readonly [number, number, number, number], movers: readonly number[] = []): ScriptMessage {
  const region = new Uint8Array(REGIONELEM_SIZE);
  const view = new DataView(region.buffer);
  view.setUint32(160, 0x40 | 0x400, true);
  rect.forEach((value, i) => view.setInt32(164 + 4 * i, value, true));
  region.set(new TextEncoder().encode('Duel Zone'), 438);
  const w = new ArWriter().u32(worldId).bytes(region).i32(movers.length);
  for (const id of movers) w.u32(id);
  return scripted(NULL_ID, DuelMessageType.ADDREGION, w);
}
