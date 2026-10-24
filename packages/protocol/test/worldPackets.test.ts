import { describe, expect, it } from 'vitest';
import {
  ArWriter, DPID_UNKNOWN, NULL_ID, PacketType, bytesToHex, decodeWorldPacket, encodeGetDestObj, encodeMeleeAttack,
  encodeModifyStatus, encodePlayerSetDestObj, encodeRevivalToLodestar, encodeSetTarget,
} from '../src';

const hex = (bytes: Uint8Array) => bytesToHex(bytes);

describe('the fight packets: constants', () => {
  it('copies the packet types of MsgHdr.h', () => {
    expect(PacketType.SETTARGET).toBe(0x00ff0023);
    expect(PacketType.PLAYERSETDESTOBJ).toBe(0xffffff07);
    expect(PacketType.MELEE_ATTACK).toBe(0x00ff0010);
    expect(PacketType.GETDESTOBJ).toBe(0xffffff73);
    expect(PacketType.REVIVAL_TO_LODESTAR).toBe(0x00ff00c1);
    expect(PacketType.MODIFY_STATUS).toBe(0xf000f501);
  });
});

describe('the fight packets: encoders', () => {
  it('encodeSetTarget writes what SendSetTarget writes and OnSetTarget reads', () => {
    // CDPClient::SendSetTarget (Neuz/DPClient.cpp:9886): `ar << idTarget << bClear` (OBJID, BYTE); CDPSrvr::OnSetTarget
    // (WORLDSERVER/DPSrvr.cpp:2183) reads them in that order.
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0x00ff0023).u32(0x01020304).u8(2).toBytes();
    expect(hex(encodeSetTarget(0x01020304, 2))).toBe(hex(expected));
    expect(hex(encodeSetTarget(7, 1))).toBe('ffffffff2300ff00' + '07000000' + '01');
    // 4 + 4 + 4 + 1
    expect(encodeSetTarget(7, 1).byteLength).toBe(13);
  });
  it('encodeSetTarget writes NULL_ID as an unsigned ID, to clear the focus', () => {
    expect(hex(encodeSetTarget(NULL_ID, 2))).toBe('ffffffff2300ff00' + 'ffffffff' + '02');
    expect(hex(encodeSetTarget(-1, 2))).toBe(hex(encodeSetTarget(NULL_ID, 2)));
  });

  it('encodePlayerSetDestObj writes what SendPlayerDestObj writes and OnPlayerSetDestObj reads', () => {
    // CDPClient::SendPlayerDestObj (Neuz/DPClient.cpp:10923): `ar << objid << fRange` (OBJID, float);
    // CDPSrvr::OnPlayerSetDestObj (WORLDSERVER/DPSrvr.cpp:12794) reads them in that order.
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff07).u32(0xfffffff0).f32(2.5).toBytes();
    expect(hex(encodePlayerSetDestObj(0xfffffff0, 2.5))).toBe(hex(expected));
    // 4 + 4 + 4 + 4
    expect(encodePlayerSetDestObj(7, 0).byteLength).toBe(16);
  });
  it('encodePlayerSetDestObj writes the range as a 32-bit float', () => {
    const body = encodePlayerSetDestObj(7, 0.1);
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    expect(view.getFloat32(12, true)).toBe(Math.fround(0.1));
  });

  it('encodeMeleeAttack writes what SendMeleeAttack writes and OnMeleeAttack reads', () => {
    // CDPClient::SendMeleeAttack (Neuz/DPClient.cpp:9819, `__HACK_1023` is on): `ar << dwAtkMsg << objid << nParam2 <<
    // nParam3 << fVal` (OBJMSG, OBJID, int, int, FLOAT); CDPSrvr::OnMeleeAttack (WORLDSERVER/DPSrvr.cpp:2019) reads the
    // same five, and refuses a swing whose `fVal` is not the held item's `fAttackSpeed`.
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0x00ff0010).u32(29).u32(7).i32(0).i32(0x00010000).f32(0.085).toBytes();
    expect(hex(encodeMeleeAttack(29, 7, 0.085))).toBe(hex(expected));
    // 4 + 4 + 4 + 4 + 4 + 4 + 4
    expect(encodeMeleeAttack(29, 7, 0.085).byteLength).toBe(28);
  });
  it('encodeMeleeAttack ends with the float of the attack speed, 0.085 being 0x3dae147b', () => {
    const body = encodeMeleeAttack(29, 7, 0.085);
    expect(Array.from(body.subarray(24))).toEqual([0x7b, 0x14, 0xae, 0x3d]);
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    expect(view.getUint32(24, true)).toBe(0x3dae147b);
    expect(view.getFloat32(24, true)).toBe(Math.fround(0.085));
  });
  it('encodeMeleeAttack sends parameter 2 as 0 and parameter 3 as OBJSTA_ATK1 whatever the swing', () => {
    for (const message of [29, 30, 31, 32]) {
      const body = encodeMeleeAttack(message, 0xfffffff0, 0.07);
      const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
      expect(view.getUint32(8, true)).toBe(message);
      expect(view.getUint32(12, true)).toBe(0xfffffff0);
      expect(view.getInt32(16, true)).toBe(0);
      expect(view.getInt32(20, true)).toBe(0x00010000);
    }
  });

  it('encodeGetDestObj writes what SendGetDestObj writes and OnGetDestObj reads', () => {
    // CDPClient::SendGetDestObj (Neuz/DPClient.cpp:10941): `ar << objid << objidDest`; CDPSrvr::OnGetDestObj
    // (WORLDSERVER/DPSrvr.cpp:11604) reads `objid`, then `objidDest`, and only uses the second.
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff73).u32(5).u32(0xfffffff1).toBytes();
    expect(hex(encodeGetDestObj(5, 0xfffffff1))).toBe(hex(expected));
    expect(hex(encodeGetDestObj(5, NULL_ID))).toBe('ffffffff73ffffff' + '05000000' + 'ffffffff');
    // 4 + 4 + 4 + 4
    expect(encodeGetDestObj(5, 6).byteLength).toBe(16);
  });

  it('encodeRevivalToLodestar is DPID_UNKNOWN then the type, as SendHdr writes it', () => {
    // CDPClient::SendHdr (Neuz/DPClient.cpp:11253): `BEFORESENDSOLE( ar, dwHdr, DPID_UNKNOWN )` and no fields;
    // CDPSrvr::OnRevivalLodestar (WORLDSERVER/DPSrvr.cpp:11296) reads nothing.
    expect(hex(encodeRevivalToLodestar())).toBe('ffffffffc100ff00');
    expect(hex(encodeRevivalToLodestar())).toBe(hex(new ArWriter().u32(DPID_UNKNOWN).u32(PacketType.REVIVAL_TO_LODESTAR).toBytes()));
  });

  it('encodeModifyStatus writes what SendModifyStatus writes and OnModifyStatus reads', () => {
    // CDPClient::SendModifyStatus (Neuz/DPClient.cpp:16652): `ar << nStrCount << nStaCount << nDexCount << nIntCount`
    // (int each); CDPSrvr::OnModifyStatus (WORLDSERVER/DPSrvr.cpp:8341) reads them in that order.
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xf000f501).i32(1).i32(2).i32(3).i32(4).toBytes();
    expect(hex(encodeModifyStatus({ str: 1, sta: 2, dex: 3, int: 4 }))).toBe(hex(expected));
    // 4 + 4 + 4 * 4
    expect(encodeModifyStatus({ str: 0, sta: 0, dex: 0, int: 0 }).byteLength).toBe(24);
  });
  it('encodeModifyStatus keeps the order of the fields and the sign of the counts', () => {
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xf000f501).i32(0).i32(5).i32(-1).i32(7).toBytes();
    expect(hex(encodeModifyStatus({ int: 7, dex: -1, sta: 5, str: 0 }))).toBe(hex(expected));
  });
});

describe('the fight packets: decodeWorldPacket', () => {
  it('reads what the browser sends, the DPID_UNKNOWN and the type first', () => {
    expect(decodeWorldPacket(encodeSetTarget(7, 2))).toEqual({ type: 'setTarget', targetId: 7, clear: 2 });
    expect(decodeWorldPacket(encodeSetTarget(NULL_ID, 2))).toEqual({ type: 'setTarget', targetId: 0xffffffff, clear: 2 });
    expect(decodeWorldPacket(encodeSetTarget(0xfffffff0, 1))).toEqual({ type: 'setTarget', targetId: 0xfffffff0, clear: 1 });
    expect(decodeWorldPacket(encodePlayerSetDestObj(0xfffffff0, 2.5)))
      .toEqual({ type: 'playerSetDestObj', targetId: 0xfffffff0, range: 2.5 });
    expect(decodeWorldPacket(encodePlayerSetDestObj(7, 0.1)))
      .toEqual({ type: 'playerSetDestObj', targetId: 7, range: Math.fround(0.1) });
    expect(decodeWorldPacket(encodeMeleeAttack(29, 7, 0.085))).toEqual({
      type: 'meleeAttack', message: 29, targetId: 7, param2: 0, param3: 0x00010000, attackSpeed: Math.fround(0.085),
    });
    expect(decodeWorldPacket(encodeGetDestObj(5, 0xfffffff1))).toEqual({ type: 'getDestObj', fromId: 5, destId: 0xfffffff1 });
    expect(decodeWorldPacket(encodeRevivalToLodestar())).toEqual({ type: 'revivalToLodestar' });
    expect(decodeWorldPacket(encodeModifyStatus({ str: 1, sta: 2, dex: 3, int: 4 })))
      .toEqual({ type: 'modifyStatus', str: 1, sta: 2, dex: 3, int: 4 });
    expect(decodeWorldPacket(encodeModifyStatus({ str: -1, sta: 0, dex: 0, int: 2147483647 })))
      .toEqual({ type: 'modifyStatus', str: -1, sta: 0, dex: 0, int: 2147483647 });
  });
  it('reads the swings of all four combo steps as sent', () => {
    for (const message of [29, 30, 31, 32]) {
      expect(decodeWorldPacket(encodeMeleeAttack(message, 9, 0.07)))
        .toMatchObject({ type: 'meleeAttack', message, targetId: 9, attackSpeed: Math.fround(0.07) });
    }
  });
  it('still reads the server bodies, which have no DPID_UNKNOWN in front', () => {
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.KEEP_ALIVE).toBytes())).toEqual({ type: 'keepAlive' });
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.ERROR).i32(133).toBytes())).toEqual({ type: 'error', code: 133 });
    // The fight packets are the browser's alone: a server body of such a type is not one of them.
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.SETTARGET).u32(7).u8(2).toBytes()))
      .toEqual({ type: 'unknown', packetType: 0x00ff0023 });
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.REVIVAL_TO_LODESTAR).toBytes()))
      .toEqual({ type: 'unknown', packetType: 0x00ff00c1 });
  });
  it('reports a browser packet it does not know instead of throwing', () => {
    expect(decodeWorldPacket(new ArWriter().u32(DPID_UNKNOWN).u32(0x99).u32(1).toBytes()))
      .toEqual({ type: 'unknown', packetType: 0x99 });
  });
  it('rejects trailing bytes on every fight packet', () => {
    const bodies = [
      encodeSetTarget(7, 2), encodePlayerSetDestObj(7, 1), encodeMeleeAttack(29, 7, 0.085), encodeGetDestObj(5, 6),
      encodeRevivalToLodestar(), encodeModifyStatus({ str: 1, sta: 0, dex: 0, int: 0 }),
    ];
    for (const body of bodies) {
      expect(() => decodeWorldPacket(body)).not.toThrow();
      expect(() => decodeWorldPacket(new Uint8Array([...body, 0]))).toThrow();
    }
  });
  it('rejects a fight packet cut short, anywhere', () => {
    const bodies = [
      encodeSetTarget(7, 2), encodePlayerSetDestObj(7, 1), encodeMeleeAttack(29, 7, 0.085), encodeGetDestObj(5, 6),
      encodeRevivalToLodestar(), encodeModifyStatus({ str: 1, sta: 0, dex: 0, int: 0 }),
    ];
    for (const full of bodies) {
      for (let length = 0; length < full.length; length++) {
        expect(() => decodeWorldPacket(full.subarray(0, length)), `cut at ${length} of ${full.length}`).toThrow();
      }
    }
  });
});
