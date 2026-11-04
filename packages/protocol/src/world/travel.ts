// The travel items' packets (Piece 7 M3, [R §3, §5, §6]): the item cast's state mode, its cancel, and the Scroll of
// Return's choice and answer.
//
//   CDPClient::SendStateModeCancel   Neuz/DPClient.cpp:9736-9742     STATEMODE: u32 mode, u8 flag (the cast's cancel)
//   CDPClient::SendReturnScroll      DPClient.cpp:15776-15781        RETURNSCROLL: i32 the village (0-2) or -1, the way back
//   CUserMng::AddStateMode           WORLDSERVER/User.cpp:5171-5209  STATEMODE: u32 mode, u8 flag, the item's prop id if ON
//   CDPClient::OnStateMode           DPClient.cpp:12381-12440        reads it
//   CUser::AddReturnScroll           User.cpp:6636-6645              RETURNSCORLL (sic): no body
//   CDPClient::OnReturnScrollACK     DPClient.cpp:677, :15784-15787  the answer: the scroll is used again, with no box

import type { ArReader } from '../ar/ArReader';
import { PacketType } from '../constants';
import { clientPacket } from './packet';
import type { MessageOf } from './types';

/** `STATE_BASEMOTION_MODE` (`_Common/authorization.h:150`): a mover casting an item. */
export const STATE_BASEMOTION_MODE = 4;

/** `STATEMODE_BASEMOTION_ON`, `_OFF` and `_CANCEL` (`authorization.h:154-156`). */
export const StateModeFlag = { ON: 0, OFF: 1, CANCEL: 2 } as const;

/** `SendStateModeCancel( STATE_BASEMOTION_MODE, STATEMODE_BASEMOTION_CANCEL )`: `ar << dwStateMode << nFlag`. */
export function encodeStateModeCancel(): Uint8Array {
  return clientPacket(PacketType.STATEMODE).u32(STATE_BASEMOTION_MODE).u8(StateModeFlag.CANCEL).toBytes();
}

/** `SendReturnScroll( nSelect )`: 0 Flaris, 1 Saint Morning, 2 Darkon, or -1 for the way back; the server drops others. */
export function encodeReturnScroll(select: number): Uint8Array {
  if (!Number.isInteger(select) || select < -1 || select > 2) throw new RangeError(`invalid Return scroll choice ${select}`);
  return clientPacket(PacketType.RETURNSCROLL).i32(select).toBytes();
}

/** `ar >> dwStateMode >> nFlag`, and with ON the cast item's prop id (`OnStateMode`). */
export function readStateMode(r: ArReader): MessageOf<'stateMode'> {
  const mode = r.u32();
  const flag = r.u8();
  const itemId = flag === StateModeFlag.ON ? r.u32() : null;
  return { type: 'stateMode', mode, flag, itemId };
}

export function readReturnScrollAck(): MessageOf<'returnScrollAck'> {
  return { type: 'returnScrollAck' };
}
