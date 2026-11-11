// 2026-11-11: the honour titles' packets (the honour window, CWndHonor), read as Neuz's handlers read them
// (Neuz/DPClient.cpp:17242-17292) and written as its sender writes them (:17235-17240); the own counts of the own ADD_OBJ
// (_Common/ObjSerializeOpt.cpp:604-634).
import { describe, expect, it } from 'vitest';
import { encodeBundle, honorCounts, newVagrantOwn, writeAddSelf, writeHonorChange, writeHonorList } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import {
  ArReader, ArWriter, HonorMessageType, HonorPacket, MAX_HONOR_TITLE, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket,
  encodeHonorTitleChange, readBundle,
} from '../src';
import type { AddedMover, AddedPlayer, OwnCharacter } from '../src';

const PLAYER = 9;
const OTHER = 0x2001;

const PLAYER_BASE: AddedPlayer = {
  self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: 500, job: 0, sta: 15,
  dex: 15, level: 1, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
  equipmentObjectIds: new Array<number>(31).fill(NULL_ID), shopTitle: '', own: null,
};

function selfWith(own: OwnCharacter): AddedMover {
  return {
    index: 11, scale: 1, pos: [6968, 100, 3328], angle: 0, objectId: PLAYER, motion: 0, isPlayer: true, hitPoint: 230,
    state: 1, stateFlag: 0, belligerence: 0, sfxId: 0, player: { ...PLAYER_BASE, own },
  };
}

function read(messages: ScriptMessage[]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, PLAYER, messages), WORLD_READERS);
  expect(result.skipped).toEqual([]);
  expect(result.mismatched).toEqual([]);
  return result.messages;
}

function ownOf(message: ScriptMessage): OwnCharacter | null | undefined {
  const [first] = read([message]);
  return first?.value.type === 'addMover' ? first.value.mover.player?.own : undefined;
}

describe('the honour snapshots (MsgHdr.h:1257-1258)', () => {
  it('HONOR_LIST_ACK: the own MAX_HONOR_TITLE counts by honour id (CUser::AddHonorListAck, User.cpp:7996-8008)', () => {
    expect(HonorMessageType).toEqual({ HONOR_LIST_ACK: 0x9300, HONOR_CHANGE_ACK: 0x9301 });
    const counts = honorCounts({ 0: 1440, 36: 1, 149: 7 });
    const [message] = read([writeHonorList(PLAYER, counts)]);
    expect(message?.objectId).toBe(PLAYER);
    expect(message?.value).toEqual({ type: 'honorList', counts });
    if (message?.value.type !== 'honorList') throw new Error('no list');
    expect(message.value.counts).toHaveLength(MAX_HONOR_TITLE);
  });

  it('HONOR_CHANGE_ACK: the title a mover now shows, under that mover\'s object (CUserMng::AddHonorTitleChange)', () => {
    const [shown, none] = read([writeHonorChange(OTHER, 36), writeHonorChange(PLAYER, -1)]);
    expect(shown).toMatchObject({ objectId: OTHER, value: { type: 'honorChange', honor: 36 } });
    expect(none).toMatchObject({ objectId: PLAYER, value: { type: 'honorChange', honor: -1 } });
  });
});

describe('HONOR_CHANGE_REQ (SendReqHonorTitleChange, DPClient.cpp:17235-17240)', () => {
  it('is DPID_UNKNOWN, the type and the int, as CDPSrvr::OnHonorChangeReq reads it (DPSrvr.cpp:8312-8335)', () => {
    const r = new ArReader(encodeHonorTitleChange(36));
    expect(r.u32()).toBe(0xffffffff);
    expect(r.u32()).toBe(HonorPacket.HONOR_CHANGE_REQ);
    expect(HonorPacket.HONOR_CHANGE_REQ).toBe(0x70004001);
    expect(r.i32()).toBe(36);
    r.expectEnd();
    expect(decodeWorldPacket(encodeHonorTitleChange(-1))).toEqual({ type: 'honorChangeRequest', honor: -1 });
  });
});

describe('the own honour counts, after the pockets and the mute time (ObjSerializeOpt.cpp:604-634)', () => {
  it('are read after three pockets not there and m_dwMute', () => {
    const counts = honorCounts({ 7: 300, 36: 1 });
    expect(ownOf(writeAddSelf(PLAYER, selfWith({ ...newVagrantOwn(), honorCounts: counts })))?.honorCounts).toEqual(counts);
  });

  it('are found past pockets that are there, with and without an end date (CPocket::Serialize, Pocket.cpp:28-50)', () => {
    // up to dwPetId (the banks written, no honour counts), then the pockets by hand
    const head = writeAddSelf(PLAYER, selfWith(newVagrantOwn()), { banks: [] });
    const w = new ArWriter().bytes(head.fields);
    const pocket = (max: number, expires: number) => {
      w.u8(1);
      for (let i = 0; i < max; i++) w.u32(i); // m_apIndex
      w.u8(0); // no item
      for (let i = 0; i < max; i++) w.u32(NULL_ID); // adwObjIndex
      w.i32(0).u32(expires); // m_bExpired, m_tExpirationDate
      if (expires !== 0) w.u32(3600); // the time left
    };
    pocket(6, 1_794_000_000);
    pocket(24, 0);
    w.u8(0); // the third not there
    w.u32(0); // m_dwMute
    const counts = honorCounts({ 20: 1 });
    for (const count of counts) w.i32(count);
    w.u32(0).i32(0); // m_idCampus, m_nCampusPoint (read past)
    expect(ownOf({ ...head, fields: w.toBytes() })?.honorCounts).toEqual(counts);
  });

  it('are absent when the message stops before them, and the rest is kept', () => {
    const full = writeAddSelf(PLAYER, selfWith({ ...newVagrantOwn(), petSlot: 7, honorCounts: honorCounts() }));
    const cut = { ...full, fields: full.fields.subarray(0, full.fields.length - 100) };
    const own = ownOf(cut);
    expect(own?.petSlot).toBe(7);
    expect(own?.honorCounts).toBeUndefined();
  });
});
