// 2026-11-15 (social): the duels' packets (docs/2026-11-15-social-research.md §4):
//   CDPClient::SendDuelRequest ... SendDuelPartyNo   Neuz/DPClient.cpp:9528-9604
//   CDPClient::OnDuelCount ... OnDuelPartyResult     DPClient.cpp:4648-4930, OnSetDuel :15381, OnAddRegion :16149

import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, DuelMessageType, DuelPacket, NULL_ID, PacketType, REGIONELEM_SIZE, WORLD_READERS, decodeWorldPacket,
  encodeDuelNo, encodeDuelRequest, encodeDuelYes, isDuelMessage, readBundle,
} from '../src';

const name = (w: ArWriter, text: string): ArWriter => w.i32(text.length).bytes(new TextEncoder().encode(text));

describe('the duel packets', () => {
  it('the type numbers are MsgHdr.h\'s', () => {
    expect(Object.values(DuelPacket)).toEqual([0xffffff23, 0xffffff24, 0xffffff25, 0xffffff26, 0xffffff27, 0xffffff28]);
    expect(Object.values(DuelMessageType)).toEqual([0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x66, 0x67, 0xf9]);
  });

  it('the requests carry idPlayers: the asker first; NO the asker alone', () => {
    const request = new ArReader(encodeDuelRequest(70001, 70002));
    expect([request.u32(), request.u32(), request.u32(), request.u32()]).toEqual([NULL_ID, 0xffffff23, 70001, 70002]);
    request.expectEnd();
    expect(decodeWorldPacket(encodeDuelRequest(70001, 70002, true))).toEqual({ type: 'duelRequestPacket', party: true, asker: 70001, asked: 70002 });
    expect(decodeWorldPacket(encodeDuelYes(70001, 70002))).toEqual({ type: 'duelYes', party: false, asker: 70001, own: 70002 });
    expect(decodeWorldPacket(encodeDuelYes(70001, 70002, true))).toEqual({ type: 'duelYes', party: true, asker: 70001, own: 70002 });
    expect(decodeWorldPacket(encodeDuelNo(70001))).toEqual({ type: 'duelNoPacket', party: false, asker: 70001 });
    expect(decodeWorldPacket(encodeDuelNo(70001, true))).toEqual({ type: 'duelNoPacket', party: true, asker: 70001 });
    expect(() => encodeDuelNo(-1)).toThrow();
  });

  it('the snapshots are read in order, and the bundle goes on after them', () => {
    const region = new Uint8Array(REGIONELEM_SIZE);
    const view = new DataView(region.buffer);
    view.setUint32(160, 0x40 | 0x400, true);
    [100, 200, 300, 400].forEach((value, i) => view.setInt32(164 + 4 * i, value, true));
    region.set(new TextEncoder().encode('Duel Zone'), 438);
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(13);
    w.u32(0x1234).u16(0x30).u32(70002).u32(70001);
    w.u32(0x1234).u16(0x34).u32(70002).u32(70001);
    w.u32(0x1234).u16(0x31).u32(70002).i32(3);
    w.u32(0x1234).u16(0x32).u32(0x55);
    w.u32(0x1234).u16(0x36).u32(0x55);
    w.u32(0x1234).u16(0x33).u32(NULL_ID);
    name(w.u32(0x1234).u16(0x35).i32(2).u32(9), 'Red').u32(0x55).u32(NULL_ID).i32(1);
    w.u32(0x1234).u16(0x37).i32(1).u32(70002);
    w.u32(0x1234).u16(0x38).i32(1).i32(0);
    w.u32(0x1234).u16(0x66).u32(0x1234).i32(1).i32(104).u32(0x55).u32(0);
    w.u32(0x1234).u16(0x67).i32(3);
    w.u32(NULL_ID).u16(0xf9).u32(1).bytes(region).i32(1).u32(0x1234);
    w.u32(0x1234).u16(0x00b4).i32(1).u32(0).i32(0);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    const values = result.messages.map((m) => m.value);
    expect(values).toEqual([
      { type: 'duelRequest', party: false, asker: 70002, asked: 70001 },
      { type: 'duelRequest', party: true, asker: 70002, asked: 70001 },
      { type: 'duelStart', target: 70002, flag: 3 },
      { type: 'duelNo', party: false, objectId: 0x55 },
      { type: 'duelNo', party: true, objectId: 0x55 },
      { type: 'duelCancel', objectId: NULL_ID },
      { type: 'duelPartyStart', partyId: 9, name: 'Red', members: [0x55, NULL_ID], flag: 1 },
      { type: 'duelPartyEnd', result: 'cancel', players: [70002] },
      { type: 'duelPartyEnd', result: 'win', players: [] },
      { type: 'setDuel', objectId: 0x1234, duel: 1, state: 104, other: 0x55, duelParty: 0 },
      { type: 'duelCount', count: 3 },
      { type: 'addRegion', worldId: 1, attribute: 0x440, rect: [100, 200, 300, 400], title: 'Duel Zone', movers: [0x1234] },
      { type: 'setCheerParam', points: 1, rest: 0, add: false },
    ]);
    expect(values.map((value) => isDuelMessage(value))).toEqual([...Array<boolean>(12).fill(true), false]);
  });
});
