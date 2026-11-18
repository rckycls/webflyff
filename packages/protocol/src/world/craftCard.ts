// custom (owner 2026-11-19): Bozman's Craft Card (docs/superpowers/specs/2026-11-19-craft-card-design.md). Not in V15: the
// outer repo's patches/2026-11-19-craft-card.patch adds both sides to the World server.
//
//   packet    PACKETTYPE_CRAFT_CARD 0x8FFF0110, web client -> World (CDPSrvr::OnCraftCard): DWORD Bozman's object id,
//             DWORD the Craft Stone's item id, 5 DWORD card item ids (NULL_ID when empty), DWORD tries (1-20), BYTE stop
//             at the first success
//   snapshot  SNAPSHOTTYPE_CRAFT_CARD 0x9A01, World -> web client (CUser::AddCraftCard), under the player's own id: BYTE
//             code, BYTE tries run, one DWORD per try: the item made, 0 for a fail
//
// The World decides everything (the chance, the stacks, the VIP tries); a World without the patch ignores the packet.

import type { ArReader } from '../ar/ArReader';
import { NULL_ID, PacketType } from '../constants';
import { clientPacket } from './packet';

/** The snapshot's type (`MsgHdr.h`, after the layered boss HP's 0x9A00). */
export const CraftCardMessageType = { CRAFT_CARD: 0x9a01 } as const;

/** The answer's codes (`WORLDSERVER/CraftCard.h`). */
export const CraftCardCode = { RAN: 0, TOO_FAR: 2, BAG_FULL: 3, REFUSED: 4 } as const;

/** `CRAFTCARD_MAX_CARDS` and `CRAFTCARD_MAX_TRIES` (`WORLDSERVER/CraftCard.h`). */
export const CRAFT_CARD_SLOTS = 5;
export const CRAFT_CARD_MAX_TRIES = 20;

export type CraftCardMessage = {
  type: 'craftCard';
  code: number;
  /** One per try the World ran: the item made, 0 for a fail. Empty when refused. */
  made: number[];
};

export interface CraftCardRequest {
  /** Bozman's object id. */
  npcId: number;
  /** The Craft Stone's bag object id. */
  stoneId: number;
  /** 1-5 card bag object ids; one stack may come more than once. */
  cardIds: number[];
  /** 1-20. */
  tries: number;
  stopOnSuccess: boolean;
}

function checkId(id: number): void {
  if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) throw new RangeError('invalid object id');
}

export function encodeCraftCard(request: CraftCardRequest): Uint8Array {
  const { npcId, stoneId, cardIds, tries, stopOnSuccess } = request;
  if (cardIds.length < 1 || cardIds.length > CRAFT_CARD_SLOTS) throw new RangeError(`${cardIds.length} cards, not 1-${CRAFT_CARD_SLOTS}`);
  if (!Number.isInteger(tries) || tries < 1 || tries > CRAFT_CARD_MAX_TRIES) throw new RangeError(`${tries} tries, not 1-${CRAFT_CARD_MAX_TRIES}`);
  checkId(npcId);
  checkId(stoneId);
  const w = clientPacket(PacketType.CRAFT_CARD).u32(npcId).u32(stoneId);
  for (let i = 0; i < CRAFT_CARD_SLOTS; i++) {
    const id = cardIds[i] ?? NULL_ID;
    checkId(id);
    w.u32(id);
  }
  return w.u32(tries).u8(stopOnSuccess ? 1 : 0).toBytes();
}

/** The packet as the pretend servers read it (`decodeWorldPacket`). */
export function readCraftCardPacket(r: ArReader): { type: 'craftCard' } & CraftCardRequest {
  const npcId = r.u32(), stoneId = r.u32();
  const cardIds: number[] = [];
  for (let i = 0; i < CRAFT_CARD_SLOTS; i++) cardIds.push(r.u32());
  const tries = r.u32(), stopOnSuccess = r.u8() !== 0;
  r.expectEnd();
  return { type: 'craftCard', npcId, stoneId, cardIds, tries, stopOnSuccess };
}

export function readCraftCard(r: ArReader): CraftCardMessage {
  const code = r.u8();
  const count = r.u8();
  const made: number[] = [];
  for (let i = 0; i < count; i++) made.push(r.u32());
  return { type: 'craftCard', code, made };
}

export const CRAFT_CARD_READERS: ReadonlyArray<[number, (r: ArReader) => CraftCardMessage]> = [
  [CraftCardMessageType.CRAFT_CARD, readCraftCard],
];
