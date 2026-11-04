import { describe, expect, it } from 'vitest';
import {
  ArWriter, DPID_UNKNOWN, MAX_SKILL_JOB, NULL_ID, PacketType, ProtocolError, ShortcutKind, bytesToHex, decodeWorldPacket,
  encodeAddAppletTaskBar, encodeAddItemTaskBar, encodeDoUseSkillPoint, encodeRemoveAppletTaskBar, encodeEndSkillQueue, encodeGetDestObj, encodeMeleeAttack,
  encodeModifyStatus, encodePlayerSetDestObj, encodeRemoveItemTaskBar, encodeRevivalToLodestar, encodeSetTarget,
  encodeSkillTaskBar, encodeUseSkill,
} from '../src';
import type { Shortcut, SkillSlot } from '../src';

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

// ---- Milestone 2: the packets that use skills, spend skill points and edit the task bar ----

/** The wire order of a `SHORTCUT`: `m_dwShortcut, m_dwId, m_dwType, m_dwIndex, m_dwUserId, m_dwData`. */
const shortcut = (
  kind: number, id: number, type: number, index: number, userId: number, data: number, text = '',
): Shortcut => ({ kind, id, type, index, userId, data, text });
/**
 * The shortcut Neuz makes of a skill (`CWndTaskBar::SetShortcut`, `_Interface/WndTaskBar.cpp:1514-1667`, and
 * `SetSkillQueue`, :1862-1868): `SHORTCUT_SKILL`, own job skill (type 0), `m_dwId` the index into `m_aJobSkill`,
 * `m_dwIndex` the slot, no user, and `m_dwData` where it sits: 0 the applet row, 1 an item bar, 2 the action slot.
 */
const skillShortcut = (skillIndex: number, slot: number, where: number): Shortcut =>
  shortcut(ShortcutKind.SKILL, skillIndex, 0, slot, 0, where);
const noShortcut = shortcut(ShortcutKind.NONE, 0, 0, 0, 0, 0);

/** A skill array of 45 slots: the given ones first, the rest empty (`NULL_ID`, level 0). */
const skillArray = (filled: SkillSlot[]): SkillSlot[] =>
  Array.from({ length: MAX_SKILL_JOB }, (_, i) => filled[i] ?? { skill: NULL_ID, level: 0 });

describe('the skill packets: constants', () => {
  it('copies the packet types of MsgHdr.h', () => {
    expect(PacketType.USESKILL).toBe(0x00ff0020);
    expect(PacketType.DOUSESKILLPOINT).toBe(0x000f0003);
    expect(PacketType.ADDITEMTASKBAR).toBe(0xffffff0c);
    expect(PacketType.REMOVEITEMTASKBAR).toBe(0xffffff0d);
    expect(PacketType.SKILLTASKBAR).toBe(0xffffff0e);
    expect(PacketType.ENDSKILLQUEUE).toBe(0x00ff00d5);
  });
});

describe('the skill packets: encoders', () => {
  it('encodeUseSkill writes what SendUseSkill writes and OnUseSkill reads, 24 bytes', () => {
    // CDPClient::SendUseSkill (Neuz/DPClient.cpp:9855-9867, __VER >= 8): `ar << wType << wId << objid << nUseSkill <<
    // bControl` (WORD, WORD, OBJID, int, BOOL); CDPSrvr::OnUseSkill (WORLDSERVER/DPSrvrLux.cpp:32) reads the same five.
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0x00ff0020).u16(0).u16(0).u32(7).i32(0).i32(0).toBytes();
    expect(hex(encodeUseSkill(0, 7, 0))).toBe(hex(expected));
    expect(hex(encodeUseSkill(0, 7, 0))).toBe('ffffffff' + '2000ff00' + '0000' + '0000' + '07000000' + '00000000' + '00000000');
    // 4 + 4 + 2 + 2 + 4 + 4 + 4
    expect(encodeUseSkill(0, 7, 0).byteLength).toBe(24);
  });
  it('encodeUseSkill writes the skill index as a WORD, the use type and the Ctrl key as ints', () => {
    const queue = new ArWriter().u32(DPID_UNKNOWN).u32(0x00ff0020).u16(0).u16(44).u32(0xfffffff0).i32(1).i32(1).toBytes();
    expect(hex(encodeUseSkill(44, 0xfffffff0, 1, true))).toBe(hex(queue));
    expect(hex(encodeUseSkill(2, 9, 1, false))).toBe(hex(encodeUseSkill(2, 9, 1)));
    expect(encodeUseSkill(2, 9, 1, true).byteLength).toBe(24);
  });
  it('encodeUseSkill writes NULL_ID as an unsigned ID', () => {
    expect(hex(encodeUseSkill(0, -1, 0))).toBe(hex(encodeUseSkill(0, NULL_ID, 0)));
  });
  it('encodeUseSkill refuses an index the server drops without a word, which would leave the player waiting', () => {
    // `nIdx < 0 || nIdx >= MAX_SKILL_JOB` returns with no CLEAR_USESKILL (DPSrvrLux.cpp:46-47).
    expect(() => encodeUseSkill(45, 7, 0)).toThrow(ProtocolError);
    expect(() => encodeUseSkill(-1, 7, 0)).toThrow(ProtocolError);
    expect(() => encodeUseSkill(1.5, 7, 0)).toThrow(ProtocolError);
    expect(() => encodeUseSkill(44, 7, 0)).not.toThrow();
  });

  it('encodeDoUseSkillPoint writes what SendDoUseSkillPoint writes and OnDoUseSkillPoint reads, 45 pairs', () => {
    // CDPClient::SendDoUseSkillPoint (Neuz/DPClient.cpp:9710-9728): for each of the MAX_SKILL_JOB slots `ar <<
    // dwSkill << dwLevel` (DWORDs), nothing else; CDPSrvr::OnDoUseSkillPoint (WORLDSERVER/DPSrvr.cpp:1104) reads the same.
    const skills = skillArray([{ skill: 1, level: 3 }, { skill: 2, level: 1 }, { skill: 3, level: 0 }]);
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0x000f0003);
    for (const s of skills) expected.u32(s.skill).u32(s.level);
    expect(hex(encodeDoUseSkillPoint(skills))).toBe(hex(expected.toBytes()));
    // 4 + 4 + 45 * 8
    expect(encodeDoUseSkillPoint(skills).byteLength).toBe(368);
    expect(hex(encodeDoUseSkillPoint(skills).subarray(0, 8 + 16)))
      .toBe('ffffffff' + '03000f00' + '01000000' + '03000000' + '02000000' + '01000000');
  });
  it('encodeDoUseSkillPoint writes an empty slot as NULL_ID and 0, slot by slot', () => {
    const body = encodeDoUseSkillPoint(skillArray([]));
    expect(hex(body.subarray(8, 16))).toBe('ffffffff' + '00000000');
    expect(hex(body.subarray(8 + 44 * 8))).toBe('ffffffff' + '00000000');
  });
  it('encodeDoUseSkillPoint refuses an array that is not 45 slots long', () => {
    expect(() => encodeDoUseSkillPoint(skillArray([]).slice(0, 44))).toThrow(ProtocolError);
    expect(() => encodeDoUseSkillPoint([...skillArray([]), { skill: NULL_ID, level: 0 }])).toThrow(ProtocolError);
    expect(() => encodeDoUseSkillPoint([])).toThrow(ProtocolError);
  });

  it('encodeAddItemTaskBar writes what SendAddItemTaskBar writes and OnAddItemTaskBar reads', () => {
    // CDPClient::SendAddItemTaskBar (Neuz/DPClient.cpp:11014-11025): `ar << nSlotIndex << nIndex` (BYTE, BYTE), then
    // m_dwShortcut, m_dwId, m_dwType, m_dwIndex, m_dwUserId, m_dwData (DWORDs), and `WriteString( m_szString )` for
    // SHORTCUT_CHAT alone; CDPSrvr::OnAddItemTaskBar (WORLDSERVER/DPSrvr.cpp:12428) reads the same.
    const s = skillShortcut(0, 3, 1);
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0c).u8(0).u8(3).u32(6).u32(0).u32(0).u32(3).u32(0).u32(1);
    expect(hex(encodeAddItemTaskBar(0, 3, s))).toBe(hex(expected.toBytes()));
    // 4 + 4 + 1 + 1 + 6 * 4
    expect(encodeAddItemTaskBar(0, 3, s).byteLength).toBe(34);
  });
  it('encodeAddItemTaskBar writes the string of a chat shortcut and of no other', () => {
    const chat = shortcut(ShortcutKind.CHAT, 0, 0, 2, 0, 1, '/s hi');
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0c).u8(7).u8(8).u32(8).u32(0).u32(0).u32(2).u32(0).u32(1)
      .string('/s hi');
    expect(hex(encodeAddItemTaskBar(7, 8, chat))).toBe(hex(expected.toBytes()));
    // 34 + 4 + 5
    expect(encodeAddItemTaskBar(7, 8, chat).byteLength).toBe(43);
    // `m_szString` is only written when `m_dwShortcut == SHORTCUT_CHAT`, so a stale text on another kind stays behind.
    const stale = { ...skillShortcut(0, 3, 1), text: 'stale' };
    expect(hex(encodeAddItemTaskBar(0, 3, stale))).toBe(hex(encodeAddItemTaskBar(0, 3, skillShortcut(0, 3, 1))));
  });
  it('encodeAddItemTaskBar takes a chat text of 127 bytes, the char[128] with its terminator, and refuses 128', () => {
    const chat = (text: string) => shortcut(ShortcutKind.CHAT, 0, 0, 0, 0, 1, text);
    expect(() => encodeAddItemTaskBar(0, 0, chat('x'.repeat(127)))).not.toThrow();
    expect(() => encodeAddItemTaskBar(0, 0, chat('x'.repeat(128)))).toThrow(ProtocolError);
  });
  it('encodeAddItemTaskBar refuses a bar or a slot the server drops (MAX_SLOT_ITEM_COUNT 8, MAX_SLOT_ITEM 9)', () => {
    const s = skillShortcut(0, 0, 1);
    for (const [bar, slot] of [[8, 0], [0, 9], [-1, 0], [0, -1], [0.5, 0], [256, 0]]) {
      expect(() => encodeAddItemTaskBar(bar, slot, s), `bar ${bar} slot ${slot}`).toThrow(ProtocolError);
    }
    expect(() => encodeAddItemTaskBar(7, 8, s)).not.toThrow();
  });

  it('encodeRemoveItemTaskBar writes what SendRemoveItemTaskBar writes and OnRemoveItemTaskBar reads', () => {
    // CDPClient::SendRemoveItemTaskBar (Neuz/DPClient.cpp:11008): `ar << nSlotIndex << nIndex` (BYTE, BYTE);
    // CDPSrvr::OnRemoveItemTaskBar (WORLDSERVER/DPSrvr.cpp:12477) reads the same two.
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0d).u8(7).u8(8).toBytes();
    expect(hex(encodeRemoveItemTaskBar(7, 8))).toBe(hex(expected));
    expect(hex(encodeRemoveItemTaskBar(7, 8))).toBe('ffffffff' + '0dffffff' + '07' + '08');
    // 4 + 4 + 1 + 1
    expect(encodeRemoveItemTaskBar(0, 0).byteLength).toBe(10);
  });
  it('encodeRemoveItemTaskBar refuses a bar or a slot the server drops', () => {
    for (const [bar, slot] of [[8, 0], [0, 9], [-1, 0], [0, -1]]) {
      expect(() => encodeRemoveItemTaskBar(bar, slot), `bar ${bar} slot ${slot}`).toThrow(ProtocolError);
    }
  });

  it('encodeSkillTaskBar writes what SendSkillTaskBar writes and OnSkillTaskBar reads: all 5 slots', () => {
    // CDPClient::SendSkillTaskBar (Neuz/DPClient.cpp:10972-10989): `ar << nCount` (int, patched to MAX_SLOT_QUEUE after
    // the loop), then for i < MAX_SLOT_QUEUE `ar << (BYTE)i` and the six DWORDs of m_aSlotQueue[i] with no string;
    // CDPSrvr::OnSkillTaskBar (WORLDSERVER/DPSrvr.cpp:12363) reads a count of at most 5 and overwrites those slots.
    const queue = [skillShortcut(0, 0, 2), skillShortcut(1, 1, 2), skillShortcut(2, 2, 2), null, null];
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0e).i32(5);
    queue.forEach((s, i) => {
      expected.u8(i);
      if (s === null) expected.u32(0).u32(0).u32(0).u32(0).u32(0).u32(0);
      else expected.u32(s.kind).u32(s.id).u32(s.type).u32(s.index).u32(s.userId).u32(s.data);
    });
    expect(hex(encodeSkillTaskBar(queue))).toBe(hex(expected.toBytes()));
    // 4 + 4 + 4 + 5 * (1 + 6 * 4)
    expect(encodeSkillTaskBar(queue).byteLength).toBe(137);
  });
  it('encodeSkillTaskBar always writes the count 5, with the empty slots after the given ones', () => {
    const count = (body: Uint8Array) => new DataView(body.buffer, body.byteOffset, body.byteLength).getInt32(8, true);
    const one = [skillShortcut(0, 0, 2)];
    expect(count(encodeSkillTaskBar(one))).toBe(5);
    expect(hex(encodeSkillTaskBar(one))).toBe(hex(encodeSkillTaskBar([skillShortcut(0, 0, 2), null, null, null, null])));
    expect(count(encodeSkillTaskBar([]))).toBe(5);
    expect(hex(encodeSkillTaskBar([]))).toBe(hex(encodeSkillTaskBar([null, null, null, null, null])));
    expect(encodeSkillTaskBar([]).byteLength).toBe(137);
    expect(count(encodeSkillTaskBar([null, null, null, null, null]))).toBe(5);
  });
  it('encodeSkillTaskBar writes an empty slot in the middle as it stands, and numbers the slots by position', () => {
    // The server only tests `IsEmpty()`, m_dwShortcut == SHORTCUT_NONE, of a slot (UserTaskBar.cpp:217), so an
    // emptied one is all zeros here.
    const body = encodeSkillTaskBar([null, skillShortcut(1, 1, 2)]);
    expect(hex(body.subarray(12, 12 + 25))).toBe('00' + '00000000'.repeat(6));
    expect(hex(body.subarray(12 + 25, 12 + 50)))
      .toBe('01' + '06000000' + '01000000' + '00000000' + '01000000' + '00000000' + '02000000');
  });
  it('encodeSkillTaskBar refuses more than 5 slots, which the server drops whole', () => {
    // `if( nCount > MAX_SLOT_QUEUE ) return;`
    expect(() => encodeSkillTaskBar([null, null, null, null, null, null])).toThrow(ProtocolError);
    expect(() => encodeSkillTaskBar([null, null, null, null, null])).not.toThrow();
  });

  it('encodeEndSkillQueue is DPID_UNKNOWN then the type, as SendHdr writes it', () => {
    // CDPClient::SendEndSkillQueue (Neuz/DPClient.cpp:15819) is `SendHdr( PACKETTYPE_ENDSKILLQUEUE )` (:11253): no
    // fields; CDPSrvr::OnEndSkillQueue (WORLDSERVER/DPSrvr.cpp:4963) reads none.
    expect(hex(encodeEndSkillQueue())).toBe('ffffffffd500ff00');
    expect(hex(encodeEndSkillQueue())).toBe(hex(new ArWriter().u32(DPID_UNKNOWN).u32(PacketType.ENDSKILLQUEUE).toBytes()));
  });
});

/** One of each skill packet, the chat edit being the one with a string. */
function skillPackets(): Uint8Array[] {
  return [
    encodeUseSkill(1, 7, 1, true), encodeDoUseSkillPoint(skillArray([{ skill: 1, level: 3 }])),
    encodeAddItemTaskBar(0, 3, skillShortcut(0, 3, 1)),
    encodeAddItemTaskBar(7, 8, shortcut(ShortcutKind.CHAT, 0, 0, 2, 0, 1, '/s hi')),
    encodeRemoveItemTaskBar(7, 8), encodeSkillTaskBar([skillShortcut(0, 0, 2), null]), encodeEndSkillQueue(),
  ];
}

describe('the skill packets: decodeWorldPacket', () => {
  it('reads what the browser sends, the DPID_UNKNOWN and the type first', () => {
    expect(decodeWorldPacket(encodeUseSkill(0, 7, 0))).toEqual({
      type: 'useSkill', skillType: 0, index: 0, targetId: 7, useType: 0, control: false,
    });
    expect(decodeWorldPacket(encodeUseSkill(44, 0xfffffff0, 1, true))).toEqual({
      type: 'useSkill', skillType: 0, index: 44, targetId: 0xfffffff0, useType: 1, control: true,
    });
    const skills = skillArray([{ skill: 1, level: 3 }, { skill: 2, level: 1 }]);
    expect(decodeWorldPacket(encodeDoUseSkillPoint(skills))).toEqual({ type: 'doUseSkillPoint', skills });
    expect(decodeWorldPacket(encodeAddItemTaskBar(0, 3, skillShortcut(0, 3, 1))))
      .toEqual({ type: 'addItemTaskBar', bar: 0, slot: 3, shortcut: skillShortcut(0, 3, 1) });
    const chat = shortcut(ShortcutKind.CHAT, 0, 0, 2, 0, 1, '/s hi');
    expect(decodeWorldPacket(encodeAddItemTaskBar(7, 8, chat)))
      .toEqual({ type: 'addItemTaskBar', bar: 7, slot: 8, shortcut: chat });
    expect(decodeWorldPacket(encodeRemoveItemTaskBar(7, 8))).toEqual({ type: 'removeItemTaskBar', bar: 7, slot: 8 });
    expect(decodeWorldPacket(encodeEndSkillQueue())).toEqual({ type: 'endSkillQueue' });
  });
  it('reads a SKILLTASKBAR as the slots it names, each with its shortcut', () => {
    const queue = [skillShortcut(0, 0, 2), skillShortcut(1, 1, 2), skillShortcut(2, 2, 2), null, null];
    expect(decodeWorldPacket(encodeSkillTaskBar(queue))).toEqual({
      type: 'skillTaskBar',
      entries: [
        { slot: 0, shortcut: skillShortcut(0, 0, 2) }, { slot: 1, shortcut: skillShortcut(1, 1, 2) },
        { slot: 2, shortcut: skillShortcut(2, 2, 2) }, { slot: 3, shortcut: noShortcut }, { slot: 4, shortcut: noShortcut },
      ],
    });
  });
  it('reads a SKILLTASKBAR of fewer slots, which the server accepts and only overwrites those', () => {
    // `for( i < nCount ) { ar >> nIndex; if( nIndex >= MAX_SLOT_QUEUE ) return; ...}`: the slots can come in any order.
    const two = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0e).i32(2)
      .u8(3).u32(6).u32(1).u32(0).u32(3).u32(0).u32(2)
      .u8(1).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0).toBytes();
    expect(decodeWorldPacket(two)).toEqual({
      type: 'skillTaskBar', entries: [{ slot: 3, shortcut: skillShortcut(1, 3, 2) }, { slot: 1, shortcut: noShortcut }],
    });
    expect(decodeWorldPacket(new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0e).i32(0).toBytes()))
      .toEqual({ type: 'skillTaskBar', entries: [] });
  });
  it('rejects a SKILLTASKBAR or an item edit the server drops: a count over 5, a slot out of range', () => {
    const sixCount = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0e).i32(6).toBytes();
    expect(() => decodeWorldPacket(sixCount)).toThrow(ProtocolError);
    const badSlot = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0e).i32(1).u8(5).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0)
      .toBytes();
    expect(() => decodeWorldPacket(badSlot)).toThrow(ProtocolError);
    const badBar = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0c).u8(8).u8(0).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0)
      .toBytes();
    expect(() => decodeWorldPacket(badBar)).toThrow(ProtocolError);
    const badItemSlot = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0d).u8(0).u8(9).toBytes();
    expect(() => decodeWorldPacket(badItemSlot)).toThrow(ProtocolError);
  });
  it('reads a USESKILL whose Ctrl flag is any non-zero BOOL as pressed', () => {
    const body = new ArWriter().u32(DPID_UNKNOWN).u32(0x00ff0020).u16(0).u16(1).u32(5).i32(0).i32(2).toBytes();
    expect(decodeWorldPacket(body)).toMatchObject({ type: 'useSkill', index: 1, control: true });
  });
  it('does not take a server body of these types for a browser packet', () => {
    // The skill packets are the browser's alone: a server body of such a type has no DPID_UNKNOWN in front.
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.USESKILL).u16(0).u16(0).u32(7).i32(0).i32(0).toBytes()))
      .toEqual({ type: 'unknown', packetType: 0x00ff0020 });
    expect(decodeWorldPacket(new ArWriter().u32(PacketType.ENDSKILLQUEUE).toBytes()))
      .toEqual({ type: 'unknown', packetType: 0x00ff00d5 });
  });
  it('rejects trailing bytes on every skill packet', () => {
    for (const body of skillPackets()) {
      expect(() => decodeWorldPacket(body)).not.toThrow();
      expect(() => decodeWorldPacket(new Uint8Array([...body, 0]))).toThrow();
    }
  });
  it('rejects a skill packet cut short, anywhere', () => {
    for (const full of skillPackets()) {
      for (let length = 0; length < full.length; length++) {
        expect(() => decodeWorldPacket(full.subarray(0, length)), `cut at ${length} of ${full.length}`).toThrow();
      }
    }
  });
});

describe('the applet row (2026-11-05: skills could not be dropped on it)', () => {
  it('encodeAddAppletTaskBar writes what SendAddAppletTaskBar writes (DPClient.cpp:11002-11013): the slot, the six fields', () => {
    const s = skillShortcut(0, 4, 0);
    const expected = new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0b).u8(4).u32(6).u32(0).u32(0).u32(4).u32(0).u32(0);
    expect(hex(encodeAddAppletTaskBar(4, s))).toBe(hex(expected.toBytes()));
    expect(decodeWorldPacket(encodeAddAppletTaskBar(4, s))).toEqual({ type: 'addAppletTaskBar', slot: 4, shortcut: s });
    // MAX_SLOT_APPLET 18
    expect(() => encodeAddAppletTaskBar(18, s)).toThrow(ProtocolError);
  });

  it('encodeRemoveAppletTaskBar writes what SendRemoveAppletTaskBar writes (:10996-11001): the slot', () => {
    expect(hex(encodeRemoveAppletTaskBar(4))).toBe(hex(new ArWriter().u32(DPID_UNKNOWN).u32(0xffffff0a).u8(4).toBytes()));
    expect(decodeWorldPacket(encodeRemoveAppletTaskBar(4))).toEqual({ type: 'removeAppletTaskBar', slot: 4 });
    expect(PacketType.ADDAPPLETTASKBAR).toBe(0xffffff0b);
    expect(PacketType.REMOVEAPPLETTASKBAR).toBe(0xffffff0a);
  });
});
