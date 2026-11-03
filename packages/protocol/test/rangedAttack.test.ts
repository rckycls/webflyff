import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, MessageType, NULL_ID, PacketType, WORLD_READERS, encodeMagicAttack, encodeRangeAttack,
  encodeSfxClear, encodeSfxHit, encodeSfxId, readBundle,
} from '../src';
import { readCreateSfxAllow, readMagicAttack, readRangeAttack } from '../src/world/combat';

const PLAYER = 0x1234;

interface Msg { objectId: number; type: number; fields: Uint8Array }

/** A SNAPSHOT body written by hand, without the table of contents: a reader that is missing ends it. */
function body(messages: Msg[]): Uint8Array {
  const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(messages.length);
  for (const m of messages) w.u32(m.objectId).u16(m.type).bytes(m.fields);
  return w.toBytes();
}

const magic = () => new ArWriter().u32(36).u32(9001).i32(0).i32(0).i32(3).i32(5).toBytes();
const range = () => new ArWriter().u32(35).u32(9001).i32(4).i32(0).i32(6).toBytes();
const allow = () => new ArWriter().u32(112).u32(33).f32(6968.5).f32(100.25).f32(3328.5).i32(9001).toBytes();

/** A packet's body after its 8-byte header (`DPID_UNKNOWN`, the type), which it checks. */
function after(bytes: Uint8Array, type: number): ArReader {
  const r = new ArReader(bytes);
  r.u32();
  expect(r.u32()).toBe(type);
  return r;
}

describe('the ranged attacks and the hit reports', () => {
  it('reads MAGIC_ATTACK, RANGE_ATTACK and CREATESFXALLOW with their fields', () => {
    expect(readMagicAttack(new ArReader(magic()))).toEqual({
      type: 'magicAttack', message: 36, targetId: 9001, param2: 0, param3: 0, power: 3, sfxHitId: 5,
    });
    expect(readRangeAttack(new ArReader(range()))).toEqual({
      type: 'rangeAttack', message: 35, targetId: 9001, param2: 4, param3: 0, sfxHitId: 6,
    });
    expect(readCreateSfxAllow(new ArReader(allow()))).toEqual({
      type: 'createSfxAllow', arrowXi: 112, hitXi: 33, pos: [6968.5, 100.25, 3328.5], targetId: 9001,
    });
    expect([MessageType.MAGIC_ATTACK, MessageType.RANGE_ATTACK, MessageType.CREATESFXALLOW]).toEqual([0x00e1, 0x00e2, 0x00aa]);
  });

  it('a bundle with MAGIC_ATTACK, RANGE_ATTACK and CREATESFXALLOW is read to its end', () => {
    const result = readBundle(body([
      { objectId: 7, type: 0x00e1, fields: magic() },
      { objectId: 7, type: 0x00e2, fields: range() },
      { objectId: 7, type: 0x00aa, fields: allow() },
      { objectId: 8, type: 0x00d1, fields: new ArWriter().u32(3).toBytes() },
    ]), WORLD_READERS);
    expect(result.messages.map((m) => m.type)).toEqual([0x00e1, 0x00e2, 0x00aa, 0x00d1]);
    expect(result.stoppedAt).toBeNull();
  });

  it('encodes the shots as Neuz does', () => {
    expect(PacketType.MAGIC_ATTACK).toBe(0x00ff0011);
    expect(PacketType.RANGE_ATTACK).toBe(0x00ff0012);
    const m = after(encodeMagicAttack(9001, 3, 5), 0x00ff0011);
    expect([m.u32(), m.u32(), m.i32(), m.i32(), m.i32(), m.i32()]).toEqual([36, 9001, 0, 0, 3, 5]);
    m.expectEnd();
    const r = after(encodeRangeAttack(9001, 4, 0), 0x00ff0012);
    expect([r.u32(), r.u32(), r.u32(), r.i32()]).toEqual([35, 9001, 4, 0]);
    r.expectEnd();
  });

  it('encodes the hit reports', () => {
    expect([PacketType.SFX_ID, PacketType.SFX_CLEAR, PacketType.SFX_HIT]).toEqual([0x00ff0022, 0x00ff0024, 0x00ff00d2]);
    const id = after(encodeSfxId(9001, 6, 0x4001), 0x00ff0022);
    expect([id.u32(), id.i32(), id.u32(), id.u32(), id.i32()]).toEqual([9001, 6, 0x4001, NULL_ID, 1]);
    id.expectEnd();
    const zero = after(encodeSfxId(9001, 7, 0x8, 85, 0), 0x00ff0022);
    expect([zero.u32(), zero.i32(), zero.u32(), zero.u32(), zero.i32()]).toEqual([9001, 7, 0x8, 85, 1]);
    const hit = after(encodeSfxHit(6, 4, NULL_ID, 9000), 0x00ff00d2);
    expect([hit.i32(), hit.i32(), hit.u32(), hit.u32(), hit.i32(), hit.f32(), hit.f32()]).toEqual([6, 4, NULL_ID, 9000, 0, 0, 0]);
    hit.expectEnd();
    // Piece 7 M2: a skill's hit carries its hit count, angle and push (Strong Wind's 90 and 0.4, `DamageToTarget`)
    const push = after(encodeSfxHit(6, 1, 112, 9000, 0, 90, 0.4), 0x00ff00d2);
    expect([push.i32(), push.i32(), push.u32(), push.u32(), push.i32(), push.f32(), push.f32()])
      .toEqual([6, 1, 112, 9000, 0, 90, Math.fround(0.4)]);
    const clear = after(encodeSfxClear(6, 9000), 0x00ff0024);
    expect([clear.i32(), clear.u32()]).toEqual([6, 9000]);
    clear.expectEnd();
  });
});
