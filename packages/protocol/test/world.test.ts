import { describe, expect, it } from 'vitest';
import {
  ArWriter, BUNDLE_MARKER, DPID_UNKNOWN, MessageType, PacketType, bytesToHex, decodeWorldPacket, encodeDestPos,
  encodeJoin, encodePlayerBehavior, encodePlayerCorr, encodePlayerMoved, encodeWorldKeepAlive,
} from '../src';
import type { JoinRequest, MoveReport, Vec3 } from '../src';

const hex = (bytes: Uint8Array) => bytesToHex(bytes);

const join = (over: Partial<JoinRequest> = {}): JoinRequest => ({
  worldId: 1, playerId: 7, authKey: 9, partyId: 0, guildId: 0, warId: 0, channelId: 2, slot: 1,
  name: 'Hero', account: 'webtester', passwordHash: 'abc123',
  messenger: { slot: 1, state: 0, friends: [{ id: 5, blocked: 0, state: 1 }] },
  ...over,
});

const move = (over: Partial<MoveReport> = {}): MoveReport => ({
  pos: [6968.5, 100, 3328.25], delta: [0.5, 0, -1.25], angle: 90.5, state: 0x11, stateFlag: 0x2, motion: 0x15,
  motionEx: -1, loop: 3, motionOption: 4, tick: 123456789012n,
  ...over,
});

describe('world constants', () => {
  it('copies the packet types of MsgHdr.h', () => {
    expect(PacketType.JOIN).toBe(0x0000ff00);
    expect(PacketType.PRE_JOIN).toBe(0x0000ff05);
    expect(PacketType.REPLACE).toBe(0x00ff0f00);
    expect(PacketType.SNAPSHOT).toBe(0xffffff00);
    expect(PacketType.PLAYERMOVED).toBe(0xffffff01);
    expect(PacketType.PLAYERBEHAVIOR).toBe(0xffffff02);
    expect(PacketType.PLAYERCORR).toBe(0xffffff05);
  });
  it('copies the snapshot message types of MsgHdr.h', () => {
    expect(MessageType).toEqual({
      SETPOSANGLE: 0x000e, SETPOS: 0x0010, ENVIRONMENTALL: 0x0063, MOTION: 0x0098, DESTPOS: 0x00c1, MOVERSETDESTOBJ: 0x00c2,
      DESTANGLE: 0x00c3, MOVERCORR: 0x00c8, MOVERMOVED: 0x00ca, MOVERBEHAVIOR: 0x00cb, MOVERANGLE: 0x00ce, ADD_OBJ: 0x00f0, DEL_OBJ: 0x00f1,
      REPLACE: 0x00f2, WORLD_READINFO: 0x9910,
    });
    expect(BUNDLE_MARKER).toBe(0x31434f54);
  });
});

describe('world encoders', () => {
  it("encodeJoin writes CDPClient::SendJoin's fields", () => {
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xff00)
      .u32(1).u32(7).u32(9).u32(0).u32(0).u32(0).u32(2).u8(1)
      .string('Hero').string('webtester').string('abc123')
      .u32(0).i32(1).u32(5).i32(0).u32(1).toBytes();
    expect(hex(encodeJoin(join()))).toBe(hex(expected));
  });
  it('encodeJoin writes the empty CRTMessenger when there is none', () => {
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xff00)
      .u32(1).u32(7).u32(9).u32(0).u32(0).u32(0).u32(2).u8(1)
      .string('Hero').string('webtester').string('abc123')
      .u32(0).i32(0).toBytes();
    expect(hex(encodeJoin(join({ messenger: undefined })))).toBe(hex(expected));
  });
  it('encodeJoin writes the messenger state, blocked flag and friends in CRTMessenger::Serialize order', () => {
    // CRTMessenger::Serialize: m_dwState, int size, then per friend the ID and the 8-byte `Friend` (BOOL, DWORD).
    const messenger = {
      slot: 2, state: 0xfffffff0,
      friends: [{ id: 5, blocked: 1, state: 2 }, { id: 0xfffffff1, blocked: -1, state: 0xfffffff2 }],
    };
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xff00)
      .u32(1).u32(7).u32(9).u32(0).u32(0).u32(0).u32(2).u8(1)
      .string('Hero').string('webtester').string('abc123')
      .u32(0xfffffff0).i32(2).u32(5).i32(1).u32(2).u32(0xfffffff1).i32(-1).u32(0xfffffff2).toBytes();
    expect(hex(encodeJoin(join({ messenger })))).toBe(hex(expected));
  });
  it('encodeJoin keeps IDs above 2^31 unsigned and takes the slot from the request, not the messenger', () => {
    const j = join({
      worldId: 0xfffffffe, playerId: 0xfffffff0, authKey: 0xfffffff1, partyId: 0xfffffff2, guildId: 0xfffffff3,
      warId: 0xfffffff4, channelId: 0xfffffff5, slot: 2, messenger: { slot: 0, state: 0, friends: [] },
    });
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xff00)
      .u32(0xfffffffe).u32(0xfffffff0).u32(0xfffffff1).u32(0xfffffff2).u32(0xfffffff3).u32(0xfffffff4).u32(0xfffffff5).u8(2)
      .string('Hero').string('webtester').string('abc123')
      .u32(0).i32(0).toBytes();
    expect(hex(encodeJoin(j))).toBe(hex(expected));
  });
  it('encodeJoin refuses a non-ASCII name or account', () => {
    expect(() => encodeJoin(join({ name: 'Héro' }))).toThrow();
    expect(() => encodeJoin(join({ account: 'wébtester' }))).toThrow();
  });

  it('encodeWorldKeepAlive is DPID_UNKNOWN then KEEP_ALIVE', () => {
    expect(hex(encodeWorldKeepAlive())).toBe('ffffffff18000000');
    expect(hex(encodeWorldKeepAlive())).toBe(hex(new ArWriter().u32(DPID_UNKNOWN).u32(PacketType.KEEP_ALIVE).toBytes()));
  });

  const moveBody = (type: number, m: MoveReport) => new ArWriter().u32(DPID_UNKNOWN).u32(type)
    .vec3(m.pos).vec3(m.delta).f32(m.angle).u32(m.state).u32(m.stateFlag).u32(m.motion).i32(m.motionEx)
    .i32(m.loop).u32(m.motionOption).i64(m.tick).toBytes();
  it('encodePlayerMoved and encodePlayerBehavior write a MoveReport', () => {
    const m = move();
    expect(hex(encodePlayerMoved(m))).toBe(hex(moveBody(0xffffff01, m)));
    expect(hex(encodePlayerBehavior(m))).toBe(hex(moveBody(0xffffff02, m)));
    // 8 (prefix, type) + 12 + 12 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 8
    expect(encodePlayerMoved(m).byteLength).toBe(68);
    expect(encodePlayerBehavior(m).byteLength).toBe(68);
  });
  it('encodePlayerMoved keeps the unsigned fields unsigned, the signed ones signed and the tick 64-bit', () => {
    const m = move({
      state: 0xfffffff0, stateFlag: 0x80000000, motion: 0xffffffff, motionEx: -7, loop: -2, motionOption: 0xfffffffe,
      tick: -5n,
    });
    expect(hex(encodePlayerMoved(m))).toBe(hex(moveBody(0xffffff01, m)));
    const big = move({ tick: 0x7fffffffffffffffn });
    expect(hex(encodePlayerBehavior(big))).toBe(hex(moveBody(0xffffff02, big)));
  });
  it('encodePlayerMoved writes the floats as 32-bit', () => {
    const m = move({ pos: [0.1, 0, 0], angle: 359.9 });
    const body = encodePlayerMoved(m);
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    expect(view.getFloat32(8, true)).toBe(Math.fround(0.1));
    expect(view.getFloat32(8 + 12 + 12, true)).toBe(Math.fround(359.9));
  });

  it('encodePlayerCorr writes what SendPlayerCorr writes and OnPlayerCorr reads', () => {
    // CDPClient::SendPlayerCorr (Neuz/DPClient.cpp:10866-10895): BEFORESENDSOLE( ar, PACKETTYPE_PLAYERCORR, DPID_UNKNOWN ),
    // then v, vd and f, the state and state flag (DWORD), the motion (DWORD) and m_nMotionEx (int), m_nLoop (int) and the
    // option (DWORD), and the tick (__int64); CDPSrvr::OnPlayerCorr (WORLDSERVER/DPSrvr.cpp:12888-12893) reads them so
    const m = move({
      pos: [6968.5, 100.25, 3328], delta: [0, -0.005, 0.1], angle: 271.5, state: 0x04, stateFlag: 0x01, motion: 5,
      motionEx: -1, loop: 4, motionOption: 0xfffffffe, tick: 0x0123456789abcdefn,
    });
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff05)
      .vec3([6968.5, 100.25, 3328]).vec3([0, -0.005, 0.1]).f32(271.5)
      .u32(0x04).u32(0x01)
      .u32(5).i32(-1)
      .i32(4).u32(0xfffffffe)
      .i64(0x0123456789abcdefn).toBytes();
    expect(hex(encodePlayerCorr(m))).toBe(hex(expected));
    expect(encodePlayerCorr(m).byteLength).toBe(68);
  });

  it('encodeDestPos writes the client SNAPSHOT', () => {
    const pos: Vec3 = [6968.5, 100, -3328.25];
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff00).u8(1).u16(0x00c1).vec3(pos).u8(1).toBytes();
    expect(hex(encodeDestPos(pos, true))).toBe(hex(expected));
    expect(hex(encodeDestPos(pos, false))).toBe(
      hex(new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff00).u8(1).u16(0x00c1).vec3(pos).u8(0).toBytes()),
    );
    // 4 + 4 + 1 + 2 + 12 + 1
    expect(encodeDestPos(pos, true).byteLength).toBe(24);
  });
});

describe('decodeWorldPacket', () => {
  it('keeps the whole body of JOIN and SNAPSHOT', () => {
    const bundle = new ArWriter().u32(PacketType.SNAPSHOT).u32(500).u16(0).toBytes();
    expect(decodeWorldPacket(bundle)).toEqual({ type: 'snapshot', body: bundle });
    const joinBody = new ArWriter().u32(PacketType.JOIN).u32(500).u16(1).u32(500).u16(0x00f0).bytes(new Uint8Array(40)).toBytes();
    expect(decodeWorldPacket(joinBody)).toEqual({ type: 'join', body: joinBody });
    // A bare type is still a whole body.
    const bare = new ArWriter().u32(PacketType.JOIN).toBytes();
    expect(decodeWorldPacket(bare)).toEqual({ type: 'join', body: bare });
  });
  it('decodes KEEP_ALIVE, ERROR and REPLACE', () => {
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.KEEP_ALIVE).toBytes())).toEqual({ type: 'keepAlive' });
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.ERROR).i32(133).toBytes())).toEqual({ type: 'error', code: 133 });
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.ERROR).i32(-4).toBytes())).toEqual({ type: 'error', code: -4 });
    // CDPClient::OnReplace: the world ID, then the position.
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.REPLACE).u32(2).vec3([1, 2, 3]).toBytes()))
      .toEqual({ type: 'replace', worldId: 2 });
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.REPLACE).u32(0xfffffffe).vec3([1, 2, 3]).toBytes()))
      .toEqual({ type: 'replace', worldId: 0xfffffffe });
  });
  it('reports a type it does not know instead of throwing', () => {
    expect(decodeWorldPacket(new ArWriter().u32(0x99).u32(1).toBytes())).toEqual({ type: 'unknown', packetType: 0x99 });
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.PLAYERMOVED).toBytes())).toEqual({ type: 'unknown', packetType: 0xffffff01 });
  });
  it('rejects trailing bytes on KEEP_ALIVE, ERROR and REPLACE', () => {
    const bodies = [
      new ArWriter().u32(PacketType.KEEP_ALIVE).toBytes(),
      new ArWriter().u32(PacketType.ERROR).i32(1).toBytes(),
      new ArWriter().u32(PacketType.REPLACE).u32(2).vec3([1, 2, 3]).toBytes(),
    ];
    for (const body of bodies) {
      expect(() => decodeWorldPacket(body)).not.toThrow();
      expect(() => decodeWorldPacket(new Uint8Array([...body, 0]))).toThrow();
    }
  });
  it('rejects a body cut short, anywhere', () => {
    expect(() => decodeWorldPacket(new Uint8Array(0))).toThrow();
    expect(() => decodeWorldPacket(new Uint8Array([0x18, 0, 0]))).toThrow();
    const bodies = [
      new ArWriter().u32(PacketType.ERROR).i32(1).toBytes(),
      new ArWriter().u32(PacketType.REPLACE).u32(2).vec3([1, 2, 3]).toBytes(),
    ];
    for (const full of bodies) {
      for (let length = 0; length < full.length; length++) {
        expect(() => decodeWorldPacket(full.subarray(0, length)), `cut at ${length}`).toThrow();
      }
    }
  });
});
