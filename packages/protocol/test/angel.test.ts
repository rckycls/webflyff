// Summon Angel's packets (2026-11-10, docs/superpowers/specs/2026-11-10-summon-angel-research.md):
//   CDPClient::SendCreateAngel   Neuz/DPClient.cpp:11279-11284   PACKETTYPE_CREATEANGEL 0x00fff000: one string
//   CDPClient::SendAngelBuff     DPClient.cpp:11285-11289        PACKETTYPE_ANGELBUFF 0x00fff002: nothing more
//   CDPClient::OnAngel           DPClient.cpp:11303-11354        SNAPSHOTTYPE_ANGEL 0x00b1: a state byte; ANGEL_INFO's exp,
//                                                               level and whether it is complete
//   CDPClient::OnSetLocalEvent   DPClient.cpp:6260-6265          SNAPSHOTTYPE_SET_LOCAL_EVENT 0x00b3: short id, BYTE state

import { describe, expect, it } from 'vitest';
import {
  ANGEL_INFO, EVE_PK, ArReader, ArWriter, MessageType, NULL_ID, PacketType, WORLD_READERS, createAngelText, decodeWorldPacket,
  encodeAngelBuff, encodeCreateAngel, parseCreateAngelText, readBundle,
} from '../src';

describe('the Summon Angel packets', () => {
  it('the type numbers are MsgHdr.h\'s', () => {
    expect([PacketType.CREATEANGEL, PacketType.ANGELBUFF]).toEqual([0x00fff000, 0x00fff002]);
    expect([MessageType.ANGEL, MessageType.FLYFF_EVENT, MessageType.SET_LOCAL_EVENT]).toEqual([0x00b1, 0x00b2, 0x00b3]);
    expect(EVE_PK).toBe(11);
    expect(ANGEL_INFO).toBe(1);
  });

  it('the start\'s text is "%dD%dDD" for each stack: its object id and how many of it (WndSummonAngel.cpp:467-474)', () => {
    expect(createAngelText([{ objectId: 12, count: 3 }, { objectId: 40, count: 10 }])).toBe('12D3DD40D10DD');
    expect(createAngelText([])).toBe('');
    expect(parseCreateAngelText('12D3DD40D10DD')).toEqual([{ objectId: 12, count: 3 }, { objectId: 40, count: 10 }]);
  });

  it('CREATEANGEL is the string (WriteString: its length, then its bytes)', () => {
    const bytes = encodeCreateAngel('12D3DD');
    const r = new ArReader(bytes);
    expect([r.u32(), r.u32()]).toEqual([NULL_ID, 0x00fff000]);
    expect(r.i32()).toBe(6);
    expect(new TextDecoder().decode(r.bytes(6))).toBe('12D3DD');
    r.expectEnd();
    expect(decodeWorldPacket(bytes)).toEqual({ type: 'createAngel', text: '12D3DD', parts: [{ objectId: 12, count: 3 }] });
  });

  it('ANGELBUFF has no field', () => {
    const r = new ArReader(encodeAngelBuff());
    expect([r.u32(), r.u32()]).toEqual([NULL_ID, 0x00fff002]);
    r.expectEnd();
    expect(decodeWorldPacket(encodeAngelBuff())).toEqual({ type: 'angelBuff' });
  });

  it('ANGEL INFO is read (exp, level, complete), and a bundle goes on after it', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(4);
    w.u32(0x1234).u16(MessageType.ANGEL).u8(ANGEL_INFO).i64(123456789012n).i32(61).i32(1);
    w.u32(0x1234).u16(MessageType.SET_LOCAL_EVENT).i16(1).u8(1);
    // FLYFF_EVENT: g_eLocal's 1024 states (CFlyffEvent::Serialize, flyffevent.cpp:24-34); the ones set are kept
    const states = new Uint8Array(1024); states[11] = 1; states[3] = 2;
    w.u32(0x1234).u16(MessageType.FLYFF_EVENT).bytes(states);
    w.u32(0x1234).u16(MessageType.ANGEL).u8(0); // a state Neuz does not read: nothing follows
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([
      { type: 'angel', state: 1, info: { exp: 123456789012n, level: 61, complete: true } },
      { type: 'setLocalEvent', id: 1, state: 1 },
      { type: 'flyffEvent', events: [{ id: 3, state: 2 }, { id: 11, state: 1 }] },
      { type: 'angel', state: 0 },
    ]);
  });
});
