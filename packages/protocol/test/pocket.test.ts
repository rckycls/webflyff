// 2026-11-17: the extra bag's packets (docs/2026-11-17-extra-bag-research.md §5), read as Neuz's handlers read them
// (Neuz/DPClient.cpp:17313-17346) and written as its senders write them (:11033-11045); the own pockets of the own ADD_OBJ
// (CPocket::Serialize, _Common/pocket.cpp:28-50).
import { describe, expect, it } from 'vitest';
import {
  encodeBundle, honorCounts, newVagrantOwn, writeAddSelf, writePocketAddItem, writePocketAttribute, writePocketRemoveItem,
} from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import {
  ArReader, BAG_POCKET, NULL_ID, PacketType, POCKET_SLOTS, PocketMessageType, PocketPacket, WORLD_READERS, decodeWorldPacket,
  encodeAvailPocket, encodeMoveItemPocket, isPocketMessage, readBundle,
} from '../src';
import type { AddedMover, AddedPlayer, OwnCharacter } from '../src';

const PLAYER = 9;

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

describe('the pockets\' snapshots (MsgHdr.h:1209-1211)', () => {
  it('has the V15 types and sizes', () => {
    expect(PocketMessageType).toEqual({ POCKET_ATTRIBUTE: 0x0200, POCKET_ADD_ITEM: 0x0201, POCKET_REMOVE_ITEM: 0x0202 });
    expect(POCKET_SLOTS).toEqual([6, 24, 24]);
  });

  it('reads the attribute, the added item and the removal in one bundle, and goes on after them', () => {
    const [attr, add, remove] = read([
      writePocketAttribute(PLAYER, 1, 2, 86400),
      writePocketAddItem(PLAYER, 1, { objectId: 5, itemId: 2029, count: 7 }),
      writePocketRemoveItem(PLAYER, 0, 3, 2),
    ]);
    expect(attr?.value).toEqual({ type: 'pocketAttribute', attribute: 1, pocket: 2, data: 86400 });
    expect(add?.value).toMatchObject({ type: 'pocketAddItem', pocket: 1, item: { itemId: 2029, count: 7 } });
    expect(remove?.value).toEqual({ type: 'pocketRemoveItem', pocket: 0, objectId: 3, count: 2 });
    expect([attr, add, remove].every((m) => m !== undefined && isPocketMessage(m.value))).toBe(true);
  });
});

describe('the client\'s pocket packets', () => {
  it('AVAIL_POCKET: DPID_UNKNOWN, the type, int pocket, int item (CDPSrvr::OnAvailPocket)', () => {
    const r = new ArReader(encodeAvailPocket(1, 12));
    expect(r.u32()).toBe(0xffffffff);
    expect(r.u32()).toBe(PocketPacket.AVAIL_POCKET);
    expect(r.i32()).toBe(1);
    expect(r.i32()).toBe(12);
    r.expectEnd();
    expect(decodeWorldPacket(encodeAvailPocket(2, 3))).toEqual({ type: 'availPocketRequest', pocket: 2, objectId: 3 });
  });

  it('MOVE_ITEM_POCKET: int from, int item, short count, int to; -1 is the bag (CDPSrvr::OnMoveItemOnPocket)', () => {
    const r = new ArReader(encodeMoveItemPocket(BAG_POCKET, 9, 15, 2));
    expect(r.u32()).toBe(0xffffffff);
    expect(r.u32()).toBe(0x70000007);
    expect(r.i32()).toBe(-1);
    expect(r.i32()).toBe(9);
    expect(r.i16()).toBe(15);
    expect(r.i32()).toBe(2);
    r.expectEnd();
    expect(decodeWorldPacket(encodeMoveItemPocket(1, 4, 1, BAG_POCKET)))
      .toEqual({ type: 'moveItemPocketRequest', from: 1, objectId: 4, count: 1, to: -1 });
  });
});

describe('the own pockets of the own ADD_OBJ', () => {
  it('keeps each pocket there: its items, its expired flag and its seconds left; and the honour counts after them', () => {
    const counts = honorCounts({ 4: 2 });
    const pockets = [
      { pocket: 0, expired: false, secondsLeft: null, slots: [0, 1, 2, 3, 4, 5], items: [{ objectId: 2, itemId: 2029, count: 3 }] },
      {
        pocket: 2, expired: true, secondsLeft: -40,
        slots: Array.from({ length: 24 }, (_, i) => i), items: [{ objectId: 23, itemId: 500, count: 1 }],
      },
    ];
    const [message] = read([writeAddSelf(PLAYER, selfWith({ ...newVagrantOwn(), honorCounts: counts, pockets }))]);
    if (message?.value.type !== 'addMover') throw new Error('no ADD_OBJ');
    const own = message.value.mover.player?.own;
    expect(own?.honorCounts).toEqual(counts);
    expect(own?.pockets).toHaveLength(2);
    expect(own?.pockets?.[0]).toMatchObject({ pocket: 0, expired: false, secondsLeft: null, items: [{ objectId: 2, itemId: 2029, count: 3 }] });
    expect(own?.pockets?.[1]).toMatchObject({ pocket: 2, expired: true, secondsLeft: -40, items: [{ objectId: 23, itemId: 500 }] });
  });

  it('has no pockets when none is there', () => {
    const [message] = read([writeAddSelf(PLAYER, selfWith({ ...newVagrantOwn(), honorCounts: honorCounts() }))]);
    if (message?.value.type !== 'addMover') throw new Error('no ADD_OBJ');
    expect(message.value.mover.player?.own?.pockets).toBeUndefined();
  });
});
