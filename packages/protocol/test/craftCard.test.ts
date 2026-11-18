// custom (owner 2026-11-19): Bozman's Craft Card. The web client's PACKETTYPE_CRAFT_CARD (0x8FFF0110) as the World's patch
// reads it (CDPSrvr::OnCraftCard, outer repo patches/2026-11-19-craft-card.patch), and its answer SNAPSHOTTYPE_CRAFT_CARD
// (0x9A01) as CUser::AddCraftCard writes it.
import { describe, expect, it } from 'vitest';
import { encodeBundle, writeCraftCard } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import {
  CraftCardCode, CraftCardMessageType, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeCraftCard, readBundle,
} from '../src';

const PLAYER = 9;

function read(messages: ScriptMessage[]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, PLAYER, messages), WORLD_READERS);
  expect(result.skipped).toEqual([]);
  expect(result.mismatched).toEqual([]);
  return result.messages;
}

describe('CRAFT_CARD (custom, owner 2026-11-19)', () => {
  it('encodeCraftCard writes 0x8fff0110 then npc, stone, five cards (NULL_ID padded), tries, the stop byte', () => {
    const bytes = encodeCraftCard({ npcId: 7, stoneId: 3, cardIds: [4, 4, 9], tries: 10, stopOnSuccess: true });
    expect(PacketType.CRAFT_CARD).toBe(0x8fff0110);
    // DPID_UNKNOWN, the type, then 8 DWORDs and a BYTE
    expect(bytes.length).toBe(4 + 4 + 8 * 4 + 1);
    expect(decodeWorldPacket(bytes)).toEqual({
      type: 'craftCard', npcId: 7, stoneId: 3, cardIds: [4, 4, 9, NULL_ID, NULL_ID], tries: 10, stopOnSuccess: true,
    });
    expect(decodeWorldPacket(encodeCraftCard({ npcId: 1, stoneId: 2, cardIds: [5], tries: 1, stopOnSuccess: false })))
      .toMatchObject({ cardIds: [5, NULL_ID, NULL_ID, NULL_ID, NULL_ID], tries: 1, stopOnSuccess: false });
  });

  it('encodeCraftCard refuses six cards, no card, and tries 0 or 21', () => {
    const base = { npcId: 7, stoneId: 3, tries: 1, stopOnSuccess: false };
    expect(() => encodeCraftCard({ ...base, cardIds: [1, 2, 3, 4, 5, 6] })).toThrow(RangeError);
    expect(() => encodeCraftCard({ ...base, cardIds: [] })).toThrow(RangeError);
    expect(() => encodeCraftCard({ ...base, cardIds: [1], tries: 0 })).toThrow(RangeError);
    expect(() => encodeCraftCard({ ...base, cardIds: [1], tries: 21 })).toThrow(RangeError);
    expect(() => encodeCraftCard({ ...base, cardIds: [1], tries: 20 })).not.toThrow();
  });

  it('CRAFT_CARD 0x9a01 reads code, count, and one item id per try', () => {
    expect(CraftCardMessageType).toEqual({ CRAFT_CARD: 0x9a01 });
    expect(CraftCardCode).toEqual({ RAN: 0, TOO_FAR: 2, BAG_FULL: 3, REFUSED: 4 });
    const [ran] = read([writeCraftCard(PLAYER, CraftCardCode.RAN, [3218, 0, 26601])]);
    expect(ran?.objectId).toBe(PLAYER);
    expect(ran?.value).toEqual({ type: 'craftCard', code: 0, made: [3218, 0, 26601] });
    const [refused] = read([writeCraftCard(PLAYER, CraftCardCode.TOO_FAR, [])]);
    expect(refused?.value).toEqual({ type: 'craftCard', code: 2, made: [] });
  });
});
