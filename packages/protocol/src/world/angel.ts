// Summon Angel (2026-11-10, docs/superpowers/specs/2026-11-10-summon-angel-research.md): what the browser sends and reads.
//
//   CWndSummonAngel::OnChildNotify  _Interface/WndSummonAngel.cpp:429-479  START: "%dD%dDD" per stack, then
//                                                                         SendCreateAngel
//   CDPClient::SendCreateAngel      Neuz/DPClient.cpp:11279-11284          PACKETTYPE_CREATEANGEL: WriteString( text )
//   CDPClient::SendAngelBuff        DPClient.cpp:11285-11289               PACKETTYPE_ANGELBUFF: nothing more
//   CDPClient::OnAngel              DPClient.cpp:11303-11316               SNAPSHOTTYPE_ANGEL: BYTE state; ANGEL_INFO only
//   CDPClient::OnAngelInfo          DPClient.cpp:11337-11354               EXPINTEGER exp, LONG level, BOOL complete
//   CDPClient::OnSetLocalEvent      DPClient.cpp:6260-6265                 SNAPSHOTTYPE_SET_LOCAL_EVENT: short id, BYTE state

import type { ArReader } from '../ar/ArReader';
import { PacketType } from '../constants';
import { clientPacket } from './packet';
import type { MessageOf } from './types';

/** `ANGEL_INFO` (`MsgHdr.h:1571`): the angel's EXP and level. (`ANGEL_WNDCREATE`, 0, is commented out in V15.) */
export const ANGEL_INFO = 1;

/** One stack in the Summon Angel window: its bag object id, and how many of its pieces are in the slots. */
export interface AngelStack {
  objectId: number;
  count: number;
}

/** START's text (`tempstr.Format( "%dD%dDD", itemid, extracount )`, WndSummonAngel.cpp:469-474), the stacks in order. */
export function createAngelText(stacks: readonly AngelStack[]): string {
  return stacks.map(({ objectId, count }) => `${objectId}D${count}DD`).join('');
}

/** The stacks of a START text (the pretend servers' read of it). */
export function parseCreateAngelText(text: string): AngelStack[] {
  return [...text.matchAll(/(-?\d+)D(-?\d+)DD/g)].map((match) => ({ objectId: Number(match[1]), count: Number(match[2]) }));
}

/** PACKETTYPE_CREATEANGEL: START's text (`createAngelText`). */
export function encodeCreateAngel(text: string): Uint8Array {
  return clientPacket(PacketType.CREATEANGEL).string(text).toBytes();
}

/** PACKETTYPE_ANGELBUFF: a press on the full angel's buff icon (`CWndWorld::OnLButtonDown`, WndWorld.cpp:6769-6794). */
export function encodeAngelBuff(): Uint8Array {
  return clientPacket(PacketType.ANGELBUFF).toBytes();
}

/** SNAPSHOTTYPE_ANGEL: the state, and ANGEL_INFO's EXP (an __int64), level and `BOOL bComplete`; any other state reads no more. */
export function readAngel(r: ArReader): MessageOf<'angel'> {
  const state = r.u8();
  if (state !== ANGEL_INFO) return { type: 'angel', state };
  const exp = r.i64();
  const level = r.i32();
  const complete = r.i32() !== 0;
  return { type: 'angel', state, info: { exp, level, complete } };
}

/** `MAX_EVENT` (`_Common/flyffevent.h:5`): `g_eLocal`'s states. */
const MAX_EVENT = 1024;
/** `EVE_PK` (`_Common/flyffevent.h:8-16`, the 12th of the enum): a PK server (`WorldServer.ini`'s `PK`). */
export const EVE_PK = 11;

/**
 * SNAPSHOTTYPE_FLYFF_EVENT (`CDPClient::OnFlyffEvent`, DPClient.cpp:6183-6199): `g_eLocal`'s 1024 states as they are
 * (`CFlyffEvent::Serialize`, flyffevent.cpp:24-34); the ones not 0 are kept, in id order.
 */
export function readFlyffEvent(r: ArReader): MessageOf<'flyffEvent'> {
  const states = r.bytes(MAX_EVENT);
  const events: Array<{ id: number; state: number }> = [];
  states.forEach((state, id) => { if (state !== 0) events.push({ id, state }); });
  return { type: 'flyffEvent', events };
}

/** SNAPSHOTTYPE_SET_LOCAL_EVENT: the event (`short id`, an EVE_* of `_Common/flyffevent.h`) and its state. */
export function readSetLocalEvent(r: ArReader): MessageOf<'setLocalEvent'> {
  return { type: 'setLocalEvent', id: r.i16(), state: r.u8() };
}
